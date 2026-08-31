import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@verevia/database";
import { getTenantContext, getTenantPrisma, MatchHomeAway, MatchStatus, MatchType, withTenantTransaction } from "@verevia/database";
import { AuthorizationService } from "../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../authorization/person-role-assignments.service";
import { CreateMatchDto } from "./dto/create-match.dto";
import { ListMatchesQueryDto } from "./dto/list-matches-query.dto";
import { UpdateMatchDto } from "./dto/update-match.dto";
import {
  determineMatchOutcome,
  planSlotResolutions,
  type PendingResultSlot,
  type SlotResolution,
} from "../tournaments/schedule/generator/knockout-slot-resolution";
import { computeGroupStandings, type GroupMatchResult, type GroupStandingsRow } from "../tournaments/schedule/generator/group-standings";
import { planGroupPositionResolutions, type PendingGroupPositionSlot } from "../tournaments/schedule/generator/group-position-resolution";

/**
 * A FootballMatch is either a club match or a tournament match (see ADR
 * 0008) — never both, never neither. The DTO carries both sets of fields
 * as nullable so callers don't need to branch on a discriminant to read
 * common fields (venue, startsAt, status, ...).
 */
export interface MatchDto {
  id: string;
  // Club match mode (null for tournament matches).
  teamSeasonId: string | null;
  teamId: string | null;
  teamName: string | null;
  seasonId: string | null;
  opponentName: string | null;
  // Tournament match mode (null for club matches).
  tournamentId: string | null;
  tournamentName: string | null;
  tournamentGroupId: string | null;
  tournamentGroupName: string | null;
  homeParticipantId: string | null;
  homeParticipantName: string | null;
  awayParticipantId: string | null;
  awayParticipantName: string | null;
  // Shared.
  venueId: string | null;
  venueName: string | null;
  startsAt: string;
  type: MatchType;
  status: MatchStatus;
  homeAway: MatchHomeAway;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  canEdit: boolean;
  // Phase 15: exposes ADR 0011's immutability rule to clients so the UI can
  // hide the result-entry form once it would be rejected anyway (409),
  // instead of leaking `resultPropagatedAt` itself as a raw timestamp.
  resultLocked: boolean;
}

const PARTICIPANT_SELECT = {
  select: {
    id: true,
    externalName: true,
    teamSeason: { select: { team: { select: { name: true } } } },
  },
} as const;

// slotsAsOwner: for a still-pending KO side (homeParticipantId/
// awayParticipantId NULL, see ADR 0010), this is how a human-readable
// fallback label is built instead of rendering nothing (Phase 14 fix — the
// generic match list never showed anything for a pending KO side before
// this). Deliberately NOT round-aware ("Sieger Halbfinale 1") — the round
// a match belongs to isn't persisted anywhere post-commit (only existed
// transiently during Phase 13 bracket generation), and reconstructing it
// here would need new schema/infrastructure out of Phase 14's scope. A
// plain, honest "not yet decided" label is preferred over a wrong or
// cryptic one.
const SLOT_SELECT = {
  select: {
    side: true,
    sourceType: true,
    groupId: true,
    groupPosition: true,
    group: { select: { name: true } },
  },
} as const;

const MATCH_INCLUDE = {
  teamSeason: {
    select: {
      seasonId: true,
      team: { select: { id: true, name: true, departmentId: true } },
    },
  },
  venue: { select: { name: true } },
  tournament: { select: { id: true, name: true, departmentId: true } },
  tournamentGroup: { select: { name: true } },
  homeParticipant: PARTICIPANT_SELECT,
  awayParticipant: PARTICIPANT_SELECT,
  slotsAsOwner: SLOT_SELECT,
} as const;

type ParticipantRef = {
  id: string;
  externalName: string | null;
  teamSeason: { team: { name: string } } | null;
} | null;

type PendingSlotRef = {
  side: "HOME" | "AWAY";
  sourceType: "GROUP_POSITION" | "WINNER_OF_MATCH" | "LOSER_OF_MATCH";
  groupId: string | null;
  groupPosition: number | null;
  group: { name: string } | null;
};

type MatchWithRelations = {
  id: string;
  teamSeasonId: string | null;
  venueId: string | null;
  startsAt: Date;
  type: MatchType;
  status: MatchStatus;
  homeAway: MatchHomeAway;
  opponentName: string | null;
  tournamentId: string | null;
  tournamentGroupId: string | null;
  homeParticipantId: string | null;
  awayParticipantId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  resultPropagatedAt: Date | null;
  teamSeason: { seasonId: string; team: { id: string; name: string; departmentId: string } } | null;
  venue: { name: string } | null;
  tournament: { id: string; name: string; departmentId: string } | null;
  tournamentGroup: { name: string } | null;
  homeParticipant: ParticipantRef;
  awayParticipant: ParticipantRef;
  slotsAsOwner: PendingSlotRef[];
};

function participantName(participant: ParticipantRef): string | null {
  if (!participant) {
    return null;
  }
  return participant.externalName ?? participant.teamSeason?.team.name ?? null;
}

/** Fallback label for a still-pending KO side (see MATCH_INCLUDE's slotsAsOwner comment). */
function pendingSlotLabel(slots: PendingSlotRef[], side: "HOME" | "AWAY"): string | null {
  const slot = slots.find((s) => s.side === side);
  if (!slot) return null;
  if (slot.sourceType === "GROUP_POSITION") {
    return `${slot.group?.name ?? "Unbekannte Gruppe"}, Platz ${slot.groupPosition}`;
  }
  return slot.sourceType === "WINNER_OF_MATCH" ? "Sieger (steht noch nicht fest)" : "Verlierer (steht noch nicht fest)";
}

@Injectable()
export class MatchesService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  private toDto(match: MatchWithRelations, canEdit: boolean): MatchDto {
    return {
      id: match.id,
      teamSeasonId: match.teamSeasonId,
      teamId: match.teamSeason?.team.id ?? null,
      teamName: match.teamSeason?.team.name ?? null,
      seasonId: match.teamSeason?.seasonId ?? null,
      opponentName: match.opponentName,
      tournamentId: match.tournamentId,
      tournamentName: match.tournament?.name ?? null,
      tournamentGroupId: match.tournamentGroupId,
      tournamentGroupName: match.tournamentGroup?.name ?? null,
      homeParticipantId: match.homeParticipantId,
      homeParticipantName: participantName(match.homeParticipant) ?? pendingSlotLabel(match.slotsAsOwner, "HOME"),
      awayParticipantId: match.awayParticipantId,
      awayParticipantName: participantName(match.awayParticipant) ?? pendingSlotLabel(match.slotsAsOwner, "AWAY"),
      venueId: match.venueId,
      venueName: match.venue?.name ?? null,
      startsAt: match.startsAt.toISOString(),
      type: match.type,
      status: match.status,
      homeAway: match.homeAway,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      notes: match.notes,
      canEdit,
      resultLocked: match.resultPropagatedAt !== null,
    };
  }

  /** A result may only carry a score when it is COMPLETED (mirrors the DB CHECK constraint). */
  private assertValidScoreStatus(status: MatchStatus, homeScore?: number | null, awayScore?: number | null) {
    const hasScore = homeScore != null || awayScore != null;
    if (hasScore && status !== "COMPLETED") {
      throw new BadRequestException("A result can only be set when the match status is COMPLETED");
    }
  }

  /** Club matches are authorized via canOnMatch (team-scoped); tournament matches via canOnSeason (department-scoped) — see ADR 0008. */
  private canAccess(
    assignments: Awaited<ReturnType<PersonRoleAssignmentsService["load"]>>,
    match: Pick<MatchWithRelations, "tournamentId" | "tournament" | "teamSeason">,
    action: "read" | "create" | "update",
  ): boolean {
    if (match.tournamentId) {
      return this.authz.canOnSeason(assignments, action, match.tournament!.departmentId);
    }
    return this.authz.canOnMatch(assignments, action, {
      teamId: match.teamSeason!.team.id,
      departmentId: match.teamSeason!.team.departmentId,
    });
  }

  async list(query: ListMatchesQueryDto): Promise<MatchDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const matches = await db.footballMatch.findMany({
      where: {
        teamSeasonId: query.teamSeasonId,
        status: query.status,
        type: query.type,
        tournamentId: query.tournamentId,
        tournamentGroupId: query.tournamentGroupId,
        teamSeason: query.seasonId ? { seasonId: query.seasonId } : undefined,
        startsAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      },
      include: MATCH_INCLUDE,
      orderBy: { startsAt: "asc" },
    });
    return matches
      .filter((m) => this.canAccess(assignments, m, "read"))
      .map((m) => this.toDto(m, this.canAccess(assignments, m, "update")));
  }

  async getById(id: string): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const match = await db.footballMatch.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!match) {
      throw new NotFoundException("Match not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.canAccess(assignments, match, "read")) {
      throw new ForbiddenException("Not permitted to read this match");
    }
    return this.toDto(match, this.canAccess(assignments, match, "update"));
  }

  async create(dto: CreateMatchDto): Promise<MatchDto> {
    if (dto.tournamentId) {
      return this.createTournamentMatch(dto);
    }
    return this.createClubMatch(dto);
  }

  private async createClubMatch(dto: CreateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    if (!dto.teamSeasonId || !dto.opponentName) {
      throw new BadRequestException("Club matches require teamSeasonId and opponentName");
    }

    const teamSeason = await db.teamSeason.findUnique({
      where: { id: dto.teamSeasonId },
      include: { team: { select: { id: true, departmentId: true } } },
    });
    if (!teamSeason) {
      throw new NotFoundException("Team season not found");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnMatch(assignments, "create", {
        teamId: teamSeason.team.id,
        departmentId: teamSeason.team.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to create a match for this team");
    }

    if (dto.venueId) {
      const venue = await db.venue.findUnique({ where: { id: dto.venueId } });
      if (!venue) {
        throw new NotFoundException("Venue not found");
      }
    }

    const status = dto.status ?? "SCHEDULED";
    this.assertValidScoreStatus(status, dto.homeScore, dto.awayScore);

    const match = await db.footballMatch.create({
      data: {
        tenantId: context.tenantId,
        teamSeasonId: dto.teamSeasonId,
        venueId: dto.venueId,
        startsAt: new Date(dto.startsAt),
        type: dto.type,
        status,
        homeAway: dto.homeAway,
        opponentName: dto.opponentName,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        notes: dto.notes,
      },
      include: MATCH_INCLUDE,
    });
    return this.toDto(match, true);
  }

  private async createTournamentMatch(dto: CreateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    const tournament = await db.footballTournament.findUnique({ where: { id: dto.tournamentId! } });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to create matches for this tournament");
    }

    if (!dto.homeParticipantId || !dto.awayParticipantId) {
      throw new BadRequestException("Tournament matches require homeParticipantId and awayParticipantId");
    }
    if (dto.homeParticipantId === dto.awayParticipantId) {
      throw new BadRequestException("homeParticipantId and awayParticipantId must be different");
    }

    const [homeParticipant, awayParticipant] = await Promise.all([
      db.tournamentParticipant.findUnique({ where: { id: dto.homeParticipantId } }),
      db.tournamentParticipant.findUnique({ where: { id: dto.awayParticipantId } }),
    ]);
    if (!homeParticipant || homeParticipant.tournamentId !== dto.tournamentId) {
      throw new NotFoundException("Home participant not found in this tournament");
    }
    if (!awayParticipant || awayParticipant.tournamentId !== dto.tournamentId) {
      throw new NotFoundException("Away participant not found in this tournament");
    }

    if (dto.tournamentGroupId) {
      const group = await db.tournamentGroup.findUnique({ where: { id: dto.tournamentGroupId } });
      if (!group || group.tournamentId !== dto.tournamentId) {
        throw new NotFoundException("Tournament group not found in this tournament");
      }
    }

    if (dto.venueId) {
      // Application-layer guardrail (ADR 0008): a tournament match may only
      // use a venue that has actually been assigned to the tournament.
      const tournamentVenue = await db.tournamentVenue.findFirst({
        where: { tournamentId: dto.tournamentId, venueId: dto.venueId },
      });
      if (!tournamentVenue) {
        throw new BadRequestException("This venue is not assigned to this tournament");
      }
    }

    const status = dto.status ?? "SCHEDULED";
    this.assertValidScoreStatus(status, dto.homeScore, dto.awayScore);

    const match = await db.footballMatch.create({
      data: {
        tenantId: context.tenantId,
        tournamentId: dto.tournamentId,
        tournamentGroupId: dto.tournamentGroupId,
        homeParticipantId: dto.homeParticipantId,
        awayParticipantId: dto.awayParticipantId,
        venueId: dto.venueId,
        startsAt: new Date(dto.startsAt),
        // Forced regardless of dto.type — a match with a tournamentId is
        // always TOURNAMENT (DB CHECK football_match_tournament_requires_type).
        type: "TOURNAMENT",
        status,
        homeAway: dto.homeAway,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        notes: dto.notes,
      },
      include: MATCH_INCLUDE,
    });
    return this.toDto(match, true);
  }

  async update(id: string, dto: UpdateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.footballMatch.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Match not found");
    }

    if (existing.tournamentId) {
      return this.updateTournamentMatch(existing, dto);
    }
    return this.updateClubMatch(existing, dto);
  }

  private async updateClubMatch(existing: MatchWithRelations, dto: UpdateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnMatch(assignments, "update", {
        teamId: existing.teamSeason!.team.id,
        departmentId: existing.teamSeason!.team.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to update this match");
    }

    if (dto.venueId) {
      const venue = await db.venue.findUnique({ where: { id: dto.venueId } });
      if (!venue) {
        throw new NotFoundException("Venue not found");
      }
    }

    const finalStatus = dto.status ?? existing.status;
    const finalHomeScore = dto.homeScore !== undefined ? dto.homeScore : existing.homeScore;
    const finalAwayScore = dto.awayScore !== undefined ? dto.awayScore : existing.awayScore;
    this.assertValidScoreStatus(finalStatus, finalHomeScore, finalAwayScore);

    const match = await db.footballMatch.update({
      where: { id: existing.id },
      data: {
        venueId: dto.venueId,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        type: dto.type,
        status: dto.status,
        homeAway: dto.homeAway,
        opponentName: dto.opponentName,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        notes: dto.notes,
      },
      include: MATCH_INCLUDE,
    });
    return this.toDto(match, true);
  }

  private async updateTournamentMatch(existing: MatchWithRelations, dto: UpdateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", existing.tournament!.departmentId)) {
      throw new ForbiddenException("Not permitted to update this tournament match");
    }

    if (dto.venueId) {
      const tournamentVenue = await db.tournamentVenue.findFirst({
        where: { tournamentId: existing.tournamentId!, venueId: dto.venueId },
      });
      if (!tournamentVenue) {
        throw new BadRequestException("This venue is not assigned to this tournament");
      }
    }

    if (dto.tournamentGroupId) {
      const group = await db.tournamentGroup.findUnique({ where: { id: dto.tournamentGroupId } });
      if (!group || group.tournamentId !== existing.tournamentId) {
        throw new NotFoundException("Tournament group not found in this tournament");
      }
    }

    const finalStatus = dto.status ?? existing.status;
    const finalHomeScore = dto.homeScore !== undefined ? dto.homeScore : existing.homeScore;
    const finalAwayScore = dto.awayScore !== undefined ? dto.awayScore : existing.awayScore;
    this.assertValidScoreStatus(finalStatus, finalHomeScore, finalAwayScore);

    // Phase 14 / ADR 0011: once this match's result has already been used
    // to fill in at least one dependent TournamentMatchSlot (e.g. Halbfinale
    // -> Finale), the result becomes immutable via this endpoint — silently
    // correcting it afterwards could desynchronize a participant already
    // propagated into a downstream match. Re-submitting the exact same
    // (status, homeScore, awayScore) is a harmless no-op, not a "change".
    this.assertResultNotLocked(existing, finalStatus, finalHomeScore, finalAwayScore);

    return withTenantTransaction(context.tenantId, async (tx) => {
      const targetGroupId = dto.tournamentGroupId ?? existing.tournamentGroupId;

      if (targetGroupId) {
        // This match belongs (or is being assigned) to a group — lock the
        // group's FULL match set up front, in the same deterministic (id)
        // order resolveGroupPositionSlots uses below, rather than only
        // this single row. This must be the very FIRST lock a group-match
        // update takes: a real PostgreSQL concurrency test (two different
        // matches of the same group finalized nearly simultaneously)
        // reproduced a genuine deadlock (40P01) when this row was locked
        // individually here first and the OTHER match's own individual
        // lock was exactly the row this transaction's later group-wide
        // lock (inside resolveGroupPositionSlots) needed next, and vice
        // versa — a circular wait between the two transactions. Taking
        // the group-wide lock first means both transactions contend for
        // the exact same resource in the exact same order, so the second
        // one simply blocks and waits instead of deadlocking (same
        // principle as ADR 0009, applied one step earlier). `OR id =
        // ${existing.id}` also covers the not-yet-a-member case (this
        // match is being newly assigned into the group by this very
        // update).
        await tx.$queryRaw`SELECT id FROM football_match WHERE "tournamentGroupId" = ${targetGroupId} OR id = ${existing.id} ORDER BY id FOR UPDATE`;
      } else {
        // Serializes concurrent finalizations of the SAME match (same
        // row-lock pattern as ADR 0009) — a second, racing request blocks
        // here until the first commits, then re-checks against the now-
        // current state below instead of the possibly-stale `existing` read
        // before this transaction began.
        await tx.$queryRaw`SELECT id FROM football_match WHERE id = ${existing.id} FOR UPDATE`;
      }
      const txDb = tx as unknown as PrismaClient;

      const fresh = await txDb.footballMatch.findUniqueOrThrow({ where: { id: existing.id } });
      this.assertResultNotLocked(fresh, finalStatus, finalHomeScore, finalAwayScore);

      const updated = await txDb.footballMatch.update({
        where: { id: existing.id },
        data: {
          venueId: dto.venueId,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          // type is never changed here — a tournament match stays TOURNAMENT.
          status: dto.status,
          homeAway: dto.homeAway,
          tournamentGroupId: dto.tournamentGroupId,
          homeScore: dto.homeScore,
          awayScore: dto.awayScore,
          notes: dto.notes,
        },
        include: MATCH_INCLUDE,
      });

      if (updated.status === "COMPLETED") {
        await this.resolveDependentSlots(txDb, updated);
        if (updated.tournamentGroupId) {
          await this.resolveGroupPositionSlots(txDb, updated.tournamentGroupId);
        }
      }

      return this.toDto(updated, true);
    });
  }

  /** Throws 409 if `existing`'s result was already propagated AND the incoming values would actually change it. */
  private assertResultNotLocked(
    existing: Pick<MatchWithRelations, "status" | "homeScore" | "awayScore" | "resultPropagatedAt">,
    finalStatus: MatchStatus,
    finalHomeScore: number | null,
    finalAwayScore: number | null,
  ) {
    const resultWouldChange =
      finalStatus !== existing.status || finalHomeScore !== existing.homeScore || finalAwayScore !== existing.awayScore;
    if (existing.resultPropagatedAt && resultWouldChange) {
      throw new ConflictException(
        "Das Ergebnis wurde bereits zur Auslosung nachfolgender KO-Spiele verwendet und kann nicht mehr geändert werden.",
      );
    }
  }

  /**
   * Phase 14: after a tournament match is finalized (COMPLETED with an
   * unambiguous winner/loser — see determineMatchOutcome), fill in every
   * dependent TournamentMatchSlot (WINNER_OF_MATCH/LOSER_OF_MATCH only —
   * GROUP_POSITION slots don't depend on a match result, resolving those
   * needs group-standings calculation, out of scope here) and remove the
   * now-superfluous slot rows. Idempotent by construction: once a slot is
   * resolved and deleted, a repeat call finds nothing left to do.
   */
  private async resolveDependentSlots(txDb: PrismaClient, match: MatchWithRelations): Promise<void> {
    const outcome = determineMatchOutcome({
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeParticipantId: match.homeParticipantId,
      awayParticipantId: match.awayParticipantId,
    });
    if (!outcome) return;

    const pendingSlots = await txDb.tournamentMatchSlot.findMany({
      where: { sourceMatchId: match.id, sourceType: { in: ["WINNER_OF_MATCH", "LOSER_OF_MATCH"] } },
    });
    if (pendingSlots.length === 0) return;

    const planned = planSlotResolutions(
      outcome,
      pendingSlots.map(
        (slot): PendingResultSlot => ({
          slotId: slot.id,
          targetMatchId: slot.matchId,
          side: slot.side,
          sourceType: slot.sourceType as "WINNER_OF_MATCH" | "LOSER_OF_MATCH",
        }),
      ),
    );

    await this.applySlotResolutions(txDb, planned);
    await txDb.footballMatch.update({ where: { id: match.id }, data: { resultPropagatedAt: new Date() } });
  }

  /**
   * Writes every planned resolution's participant into its target match's
   * home/away side, then deletes the now-superfluous slot rows. Shared by
   * resolveDependentSlots (WinnerOfMatch/LoserOfMatch, Phase 14) and
   * resolveGroupPositionSlots (GROUP_POSITION, Phase 16) — the two differ
   * only in how they PLAN resolutions (a single source match's outcome vs.
   * a whole group's standings), not in how a resolution gets applied.
   */
  private async applySlotResolutions(txDb: PrismaClient, planned: SlotResolution[]): Promise<void> {
    if (planned.length === 0) return;

    // Lock every distinct target match before writing into it — two
    // sources completing concurrently (e.g. two semifinals, or a group's
    // last two matches) can write DIFFERENT sides of the SAME target row;
    // the lock (plus Postgres's own per-statement row locking on UPDATE)
    // guarantees neither write is lost.
    const targetMatchIds = [...new Set(planned.map((p) => p.targetMatchId))].sort();
    for (const targetMatchId of targetMatchIds) {
      await txDb.$queryRaw`SELECT id FROM football_match WHERE id = ${targetMatchId} FOR UPDATE`;
    }

    for (const resolution of planned) {
      await txDb.footballMatch.update({
        where: { id: resolution.targetMatchId },
        data:
          resolution.side === "HOME"
            ? { homeParticipantId: resolution.participantId }
            : { awayParticipantId: resolution.participantId },
      });
    }

    await txDb.tournamentMatchSlot.deleteMany({ where: { id: { in: planned.map((p) => p.slotId) } } });
  }

  /**
   * Phase 16: after a group-stage match is finalized, checks whether ITS
   * group is now fully decided (every match COMPLETED) and, if so,
   * resolves as many pending GROUP_POSITION slots for that group as are
   * sportingly unambiguous (see group-position-resolution.ts — a genuine
   * tie is left open, never guessed). Standings are always derived live
   * from match data, never persisted (see ADR 0012).
   *
   * Once at least one slot resolves, EVERY match in the group is locked
   * (resultPropagatedAt stamped) — not just the one just finalized. This
   * reuses ADR 0011's existing immutability guard as-is: any of the
   * group's results could in principle have tipped the now-propagated
   * standings, so correcting any of them afterwards could silently
   * desynchronize the already-propagated slot, exactly the inconsistency
   * ADR 0011 exists to prevent.
   */
  private async resolveGroupPositionSlots(txDb: PrismaClient, groupId: string): Promise<void> {
    // Lock the group's full match set, in the same deterministic (id)
    // order as updateTournamentMatch's own up-front group lock above —
    // this is what makes the "last two group matches finalized nearly
    // simultaneously" race safe: whichever of the two competing
    // transactions acquires this lock second will, after the first
    // commits and releases it, re-read a group that's now actually
    // complete and correctly run the resolution exactly once. Re-locking
    // here is a harmless no-op for rows this transaction already locked
    // above (Postgres row locks are held per-transaction, not per
    // statement) — kept as defense-in-depth so this method stays correct
    // even if ever called from a path that didn't already take that lock.
    await txDb.$queryRaw`SELECT id FROM football_match WHERE "tournamentGroupId" = ${groupId} ORDER BY id FOR UPDATE`;

    const groupMatches = await txDb.footballMatch.findMany({ where: { tournamentGroupId: groupId } });
    if (groupMatches.length === 0 || groupMatches.some((m) => m.status !== "COMPLETED")) return;

    const participantIds = [...new Set(groupMatches.flatMap((m) => [m.homeParticipantId, m.awayParticipantId]))].filter(
      (id): id is string => id !== null,
    );
    const completedResults: GroupMatchResult[] = groupMatches.map((m) => ({
      homeParticipantId: m.homeParticipantId!,
      awayParticipantId: m.awayParticipantId!,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    }));
    const standings: GroupStandingsRow[] = computeGroupStandings(participantIds, completedResults);

    const pendingSlots = await txDb.tournamentMatchSlot.findMany({ where: { groupId, sourceType: "GROUP_POSITION" } });
    if (pendingSlots.length === 0) return;

    const planned = planGroupPositionResolutions(
      new Map([[groupId, standings]]),
      pendingSlots.map(
        (slot): PendingGroupPositionSlot => ({
          slotId: slot.id,
          targetMatchId: slot.matchId,
          side: slot.side,
          groupId,
          groupPosition: slot.groupPosition!,
        }),
      ),
    );
    if (planned.length === 0) return;

    await this.applySlotResolutions(txDb, planned);
    await txDb.footballMatch.updateMany({ where: { tournamentGroupId: groupId, resultPropagatedAt: null }, data: { resultPropagatedAt: new Date() } });
  }
}
