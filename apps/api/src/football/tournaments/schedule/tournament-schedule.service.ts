import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@verevia/database";
import { getTenantContext, getTenantPrisma, withTenantTransaction } from "@verevia/database";
import { AuthorizationService } from "../../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../../authorization/person-role-assignments.service";
import { CreateScheduleCommitDto } from "./dto/create-schedule-commit.dto";
import { CreateSchedulePreviewDto } from "./dto/create-schedule-preview.dto";
import { computeScheduleFingerprint } from "./generator/schedule-fingerprint";
import { GENERATOR_VERSION, SCHEDULE_GENERATION_LIMITS } from "./generator/limits";
import { generateRoundRobinFixtures, sortGroups, sortParticipantsForGrouping } from "./generator/round-robin.generator";
import { scheduleFixtures } from "./generator/schedule.scheduler";
import { validateSchedule } from "./generator/schedule.validator";
import { Fixture, GroupInput, ParticipantInput, ScheduledMatch, ScheduleSettings } from "./generator/types";

export interface TournamentScheduleMatchDto {
  groupId: string | null;
  groupName: string | null;
  round: number;
  homeParticipantId: string;
  homeParticipantName: string;
  awayParticipantId: string;
  awayParticipantName: string;
  venueId: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
}

export interface TournamentScheduleStatisticsDto {
  totalMatches: number;
  totalGroups: number;
  totalParticipants: number;
  venuesUsed: number;
  firstMatchAt: string | null;
  lastMatchEndsAt: string | null;
  tournamentDurationMinutes: number | null;
  matchesPerVenue: Record<string, number>;
  matchesPerParticipant: Record<string, number>;
}

export interface TournamentSchedulePreviewDto {
  tournamentId: string;
  generatedAt: string;
  generatorVersion: string;
  settings: {
    matchDurationMinutes: number;
    changeoverMinutes: number;
    minimumRestMinutes: number;
    venueIds: string[];
    schedulingStartsAt: string;
  };
  valid: boolean;
  matches: TournamentScheduleMatchDto[];
  conflicts: string[];
  statistics: TournamentScheduleStatisticsDto;
  fingerprint: string;
}

export interface TournamentScheduleCommitResultDto {
  tournamentId: string;
  createdMatchCount: number;
}

const SUPPORTED_MODES = new Set(["GROUPS", "GROUPS_AND_KNOCKOUT"]);

const SCHEDULE_TOURNAMENT_INCLUDE = {
  participants: {
    where: { status: "ACTIVE" as const },
    include: {
      teamSeason: { select: { team: { select: { name: true } } } },
      group: { select: { id: true, name: true, displayOrder: true } },
    },
  },
  groups: true,
  venues: { include: { venue: { select: { id: true, name: true } } } },
} as const;

type ScheduleTournament = NonNullable<
  Awaited<ReturnType<PrismaClient["footballTournament"]["findUnique"]>>
> & {
  participants: Array<{
    id: string;
    groupId: string | null;
    externalName: string | null;
    seed: number | null;
    createdAt: Date;
    teamSeason: { team: { name: string } } | null;
    group: { id: string; name: string; displayOrder: number } | null;
  }>;
  groups: Array<{ id: string; name: string; displayOrder: number }>;
  venues: Array<{ venueId: string; venue: { id: string; name: string } }>;
};

/**
 * Builds and (on commit) persists an automatic round-robin schedule for a
 * tournament's group stage — Phase 12. The generation pipeline itself
 * (fixtures → scheduling → validation → fingerprint) is pure and lives
 * under `./generator`; this service is exclusively the bridge to the
 * database: loading current state, running that pipeline, and — for
 * commit — persisting the result atomically. See
 * docs/PHASE_12_TOURNAMENT_SCHEDULE_GENERATOR_REPORT.md.
 */
@Injectable()
export class TournamentScheduleService {
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

  private async loadTournament(db: PrismaClient, tournamentId: string): Promise<ScheduleTournament> {
    const tournament = await db.footballTournament.findUnique({
      where: { id: tournamentId },
      include: SCHEDULE_TOURNAMENT_INCLUDE,
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    return tournament as unknown as ScheduleTournament;
  }

  /** Resolves participant display names — team name for internal participants, externalName for external ones. */
  private toParticipantInputs(tournament: ScheduleTournament): ParticipantInput[] {
    return tournament.participants.map((p) => ({
      id: p.id,
      groupId: p.groupId,
      seed: p.seed,
      createdAt: p.createdAt,
      displayName: p.teamSeason?.team.name ?? p.externalName ?? p.id,
    }));
  }

  private toGroupInputs(tournament: ScheduleTournament): GroupInput[] {
    return tournament.groups.map((g) => ({ id: g.id, name: g.name, displayOrder: g.displayOrder }));
  }

  /**
   * Precondition checks that reject the request outright (HTTP 400) rather
   * than producing an invalid-but-renderable preview — work order section
   * 37/38 explicitly allows either treatment for "no group"/"group too
   * small"; rejecting outright keeps the preview response meaningful (a
   * preview is only ever returned for a structurally sound request).
   */
  private assertPreconditions(tournament: ScheduleTournament, participants: ParticipantInput[], dto: CreateSchedulePreviewDto) {
    if (!SUPPORTED_MODES.has(tournament.mode ?? "")) {
      throw new BadRequestException(
        tournament.mode === "KNOCKOUT"
          ? "Die automatische Spielplanerstellung für K.-o.-Turniere folgt in einer späteren Ausbaustufe."
          : "Für dieses Turnier ist noch kein Modus festgelegt, der eine automatische Spielplanerstellung erlaubt.",
      );
    }

    if (participants.length === 0) {
      throw new BadRequestException("Diesem Turnier sind noch keine Teilnehmer zugeordnet.");
    }
    if (participants.some((p) => !p.groupId)) {
      throw new BadRequestException(
        "Es gibt Teilnehmer ohne Gruppe. Weise zunächst alle Teilnehmer einer Gruppe zu, bevor du den Spielplan berechnest.",
      );
    }

    const perGroup = new Map<string, number>();
    for (const p of participants) {
      perGroup.set(p.groupId!, (perGroup.get(p.groupId!) ?? 0) + 1);
    }
    for (const [groupId, count] of perGroup) {
      if (count < 2) {
        const group = tournament.groups.find((g) => g.id === groupId);
        throw new BadRequestException(
          `Gruppe "${group?.name ?? groupId}" hat weniger als zwei Teilnehmer — eine Gruppenphase ist damit nicht sinnvoll berechenbar.`,
        );
      }
      if (count > SCHEDULE_GENERATION_LIMITS.maxParticipantsPerGroup) {
        throw new BadRequestException(`Eine Gruppe darf höchstens ${SCHEDULE_GENERATION_LIMITS.maxParticipantsPerGroup} Teilnehmer haben.`);
      }
    }
    if (perGroup.size > SCHEDULE_GENERATION_LIMITS.maxGroups) {
      throw new BadRequestException(`Ein Turnier darf höchstens ${SCHEDULE_GENERATION_LIMITS.maxGroups} Gruppen für die automatische Erstellung haben.`);
    }

    const tournamentVenueIds = new Set(tournament.venues.map((v) => v.venueId));
    for (const venueId of dto.venueIds) {
      if (!tournamentVenueIds.has(venueId)) {
        throw new BadRequestException("Eine ausgewählte Spielstätte ist diesem Turnier nicht zugeordnet.");
      }
    }
    if (dto.venueIds.length > SCHEDULE_GENERATION_LIMITS.maxVenues) {
      throw new BadRequestException(`Es dürfen höchstens ${SCHEDULE_GENERATION_LIMITS.maxVenues} Spielstätten gleichzeitig verwendet werden.`);
    }
  }

  private resolveSettings(tournament: ScheduleTournament, dto: CreateSchedulePreviewDto): ScheduleSettings {
    const schedulingStartsAt = dto.schedulingStartsAt ? new Date(dto.schedulingStartsAt) : tournament.startsAt;
    return {
      matchDurationMinutes: dto.matchDurationMinutes,
      changeoverMinutes: dto.changeoverMinutes,
      minimumRestMinutes: dto.minimumRestMinutes,
      venueIds: dto.venueIds,
      schedulingStartsAt,
      tournamentEndsAt: tournament.endsAt,
    };
  }

  /** The full pure pipeline: fixtures → scheduling → independent re-validation. Same logic for preview and commit. */
  private runGenerator(
    tournament: ScheduleTournament,
    participants: ParticipantInput[],
    groups: GroupInput[],
    settings: ScheduleSettings,
  ): { valid: boolean; matches: ScheduledMatch[]; conflictMessages: string[] } {
    const fixtures: Fixture[] = [];
    for (const group of sortGroups(groups)) {
      const groupParticipants = sortParticipantsForGrouping(participants.filter((p) => p.groupId === group.id));
      fixtures.push(...generateRoundRobinFixtures(group.id, groupParticipants.map((p) => p.id)));
    }

    if (fixtures.length > SCHEDULE_GENERATION_LIMITS.maxGeneratedMatches) {
      return {
        valid: false,
        matches: [],
        conflictMessages: [`Die berechnete Anzahl an Spielen (${fixtures.length}) übersteigt das Limit von ${SCHEDULE_GENERATION_LIMITS.maxGeneratedMatches}.`],
      };
    }

    const scheduled = scheduleFixtures(fixtures, groups, participants, settings);
    if (!scheduled.valid) {
      return { valid: false, matches: [], conflictMessages: scheduled.conflicts.map((c) => c.message) };
    }

    // Independent second pass (work order section 16) — re-verifies the
    // scheduler's own output from scratch rather than trusting it blindly.
    const validated = validateSchedule(scheduled.matches, participants, settings);
    if (!validated.valid) {
      return { valid: false, matches: [], conflictMessages: validated.conflicts.map((c) => c.message) };
    }

    return { valid: true, matches: scheduled.matches, conflictMessages: [] };
  }

  private buildStatistics(matches: ScheduledMatch[], groups: GroupInput[], participants: ParticipantInput[]): TournamentScheduleStatisticsDto {
    const matchesPerVenue: Record<string, number> = {};
    const matchesPerParticipant: Record<string, number> = {};
    for (const match of matches) {
      matchesPerVenue[match.venueId] = (matchesPerVenue[match.venueId] ?? 0) + 1;
      matchesPerParticipant[match.homeParticipantId] = (matchesPerParticipant[match.homeParticipantId] ?? 0) + 1;
      matchesPerParticipant[match.awayParticipantId] = (matchesPerParticipant[match.awayParticipantId] ?? 0) + 1;
    }
    const starts = matches.map((m) => m.startsAt.getTime());
    const ends = matches.map((m) => m.endsAt.getTime());
    const firstMatchAt = starts.length > 0 ? new Date(Math.min(...starts)) : null;
    const lastMatchEndsAt = ends.length > 0 ? new Date(Math.max(...ends)) : null;
    return {
      totalMatches: matches.length,
      totalGroups: groups.length,
      totalParticipants: participants.length,
      venuesUsed: new Set(matches.map((m) => m.venueId)).size,
      firstMatchAt: firstMatchAt?.toISOString() ?? null,
      lastMatchEndsAt: lastMatchEndsAt?.toISOString() ?? null,
      tournamentDurationMinutes: firstMatchAt && lastMatchEndsAt ? Math.round((lastMatchEndsAt.getTime() - firstMatchAt.getTime()) / 60_000) : null,
      matchesPerVenue,
      matchesPerParticipant,
    };
  }

  private toMatchDtos(matches: ScheduledMatch[], tournament: ScheduleTournament): TournamentScheduleMatchDto[] {
    const participantNames = new Map(
      tournament.participants.map((p) => [p.id, p.teamSeason?.team.name ?? p.externalName ?? p.id]),
    );
    const groupNames = new Map(tournament.groups.map((g) => [g.id, g.name]));
    const venueNames = new Map(tournament.venues.map((v) => [v.venueId, v.venue.name]));
    return matches
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((m) => ({
        groupId: m.groupId,
        groupName: groupNames.get(m.groupId) ?? null,
        round: m.round,
        homeParticipantId: m.homeParticipantId,
        homeParticipantName: participantNames.get(m.homeParticipantId) ?? m.homeParticipantId,
        awayParticipantId: m.awayParticipantId,
        awayParticipantName: participantNames.get(m.awayParticipantId) ?? m.awayParticipantId,
        venueId: m.venueId,
        venueName: venueNames.get(m.venueId) ?? m.venueId,
        startsAt: m.startsAt.toISOString(),
        endsAt: m.endsAt.toISOString(),
      }));
  }

  private computeFingerprint(tournament: ScheduleTournament, participants: ParticipantInput[], groups: GroupInput[], settings: ScheduleSettings, matches: ScheduledMatch[]): string {
    return computeScheduleFingerprint({
      tournament: {
        id: tournament.id,
        startsAt: tournament.startsAt.toISOString(),
        endsAt: tournament.endsAt?.toISOString() ?? null,
        mode: tournament.mode,
      },
      participants: participants.map((p) => ({ id: p.id, groupId: p.groupId })),
      groups: groups.map((g) => ({ id: g.id, name: g.name, displayOrder: g.displayOrder })),
      venueIds: settings.venueIds,
      settings: {
        matchDurationMinutes: settings.matchDurationMinutes,
        changeoverMinutes: settings.changeoverMinutes,
        minimumRestMinutes: settings.minimumRestMinutes,
        schedulingStartsAt: settings.schedulingStartsAt.toISOString(),
      },
      matches,
    });
  }

  private async assertCanManage(tenantId: string, departmentId: string) {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", departmentId)) {
      throw new ForbiddenException("Not permitted to manage this tournament's schedule");
    }
  }

  async preview(tournamentId: string, dto: CreateSchedulePreviewDto): Promise<TournamentSchedulePreviewDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const tournament = await this.loadTournament(db, tournamentId);
    await this.assertCanManage(context.tenantId, tournament.departmentId);

    const participants = this.toParticipantInputs(tournament);
    const groups = this.toGroupInputs(tournament);
    this.assertPreconditions(tournament, participants, dto);
    const settings = this.resolveSettings(tournament, dto);

    const { valid, matches, conflictMessages } = this.runGenerator(tournament, participants, groups, settings);
    const statistics = this.buildStatistics(matches, groups, participants);
    const fingerprint = this.computeFingerprint(tournament, participants, groups, settings, matches);

    return {
      tournamentId: tournament.id,
      generatedAt: new Date().toISOString(),
      generatorVersion: GENERATOR_VERSION,
      settings: {
        matchDurationMinutes: settings.matchDurationMinutes,
        changeoverMinutes: settings.changeoverMinutes,
        minimumRestMinutes: settings.minimumRestMinutes,
        venueIds: settings.venueIds,
        schedulingStartsAt: settings.schedulingStartsAt.toISOString(),
      },
      valid,
      matches: this.toMatchDtos(matches, tournament),
      conflicts: conflictMessages,
      statistics,
      fingerprint,
    };
  }

  async commit(tournamentId: string, dto: CreateScheduleCommitDto): Promise<TournamentScheduleCommitResultDto> {
    const context = this.requireContext();

    // Authorization is checked BEFORE opening the row-locking transaction —
    // no reason to hold a lock while resolving roles, and a 403 shouldn't
    // depend on transaction timing.
    const preflightDb = getTenantPrisma(context.tenantId);
    const preflightTournament = await this.loadTournament(preflightDb, tournamentId);
    await this.assertCanManage(context.tenantId, preflightTournament.departmentId);

    return withTenantTransaction(context.tenantId, async (tx) => {
      // Row-lock the tournament for the remainder of this transaction — a
      // second, near-simultaneous commit for the SAME tournament blocks here
      // until this transaction finishes, then correctly sees whatever this
      // one committed (see ADR 0009 and PHASE_12 report, "Concurrent commit").
      await tx.$queryRaw`SELECT id FROM football_tournament WHERE id = ${tournamentId} FOR UPDATE`;

      // Cast: TournamentScheduleService's read helpers only use the small,
      // structurally-identical subset of the Prisma Client surface that
      // PrismaClient and Prisma.TransactionClient share (find/count on
      // tenant-scoped models) — see ADR 0009 for why a raw `tx` is used here
      // instead of `getTenantPrisma()`.
      const db = tx as unknown as PrismaClient;

      const tournament = await this.loadTournament(db, tournamentId);

      const existingMatchCount = await db.footballMatch.count({ where: { tournamentId } });
      if (existingMatchCount > 0) {
        throw new ConflictException("Für dieses Turnier existiert bereits ein Spielplan.");
      }

      const participants = this.toParticipantInputs(tournament);
      const groups = this.toGroupInputs(tournament);
      this.assertPreconditions(tournament, participants, dto);
      const settings = this.resolveSettings(tournament, dto);

      const { valid, matches, conflictMessages } = this.runGenerator(tournament, participants, groups, settings);
      if (!valid) {
        throw new ConflictException(
          `Der Spielplan kann mit den aktuellen Einstellungen nicht erstellt werden: ${conflictMessages.join(" ")}`,
        );
      }

      const freshFingerprint = this.computeFingerprint(tournament, participants, groups, settings, matches);
      if (freshFingerprint !== dto.fingerprint) {
        throw new ConflictException(
          "Das Turnier wurde seit der Vorschau geändert. Bitte den Spielplan neu berechnen.",
        );
      }

      await db.footballMatch.createMany({
        data: matches.map((m) => ({
          tenantId: context.tenantId,
          tournamentId: tournament.id,
          tournamentGroupId: m.groupId,
          homeParticipantId: m.homeParticipantId,
          awayParticipantId: m.awayParticipantId,
          venueId: m.venueId,
          startsAt: m.startsAt,
          type: "TOURNAMENT" as const,
          status: "SCHEDULED" as const,
          homeAway: "NEUTRAL" as const,
        })),
      });

      return { tournamentId: tournament.id, createdMatchCount: matches.length };
    });
  }
}
