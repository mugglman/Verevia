import { randomUUID } from "node:crypto";
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
import { CreateKnockoutCommitDto } from "./dto/create-knockout-commit.dto";
import { CreateKnockoutPreviewDto } from "./dto/create-knockout-preview.dto";
import { KnockoutEntrantDto } from "./dto/knockout-entrant.dto";
import { generateKnockoutBracket, KNOCKOUT_GENERATOR_VERSION } from "./generator/knockout-bracket.generator";
import { validateKnockoutDependencyGraph } from "./generator/knockout-dependency-graph";
import { computeKnockoutFingerprint } from "./generator/knockout-fingerprint";
import { scheduleKnockoutBracket } from "./generator/knockout.scheduler";
import { KnockoutRound, KnockoutScheduledMatch, SlotSource } from "./generator/knockout-types";
import { SCHEDULE_GENERATION_LIMITS } from "./generator/limits";
import { ScheduleSettings } from "./generator/types";

const GERMAN_ROUND_LABELS: Record<KnockoutRound, string> = {
  ROUND_OF_16: "Achtelfinale",
  QUARTERFINAL: "Viertelfinale",
  SEMIFINAL: "Halbfinale",
  THIRD_PLACE: "Spiel um Platz 3",
  FINAL: "Finale",
};

export interface KnockoutMatchDto {
  key: string;
  round: KnockoutRound;
  homeLabel: string;
  awayLabel: string;
  venueId: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
}

export interface KnockoutStatisticsDto {
  totalMatches: number;
  totalEntrants: number;
  rounds: string[];
  firstMatchAt: string | null;
  lastMatchEndsAt: string | null;
  tournamentDurationMinutes: number | null;
}

export interface KnockoutPreviewDto {
  tournamentId: string;
  generatedAt: string;
  generatorVersion: string;
  includeThirdPlace: boolean;
  settings: {
    matchDurationMinutes: number;
    changeoverMinutes: number;
    minimumRestMinutes: number;
    venueIds: string[];
    schedulingStartsAt: string;
  };
  valid: boolean;
  matches: KnockoutMatchDto[];
  conflicts: string[];
  statistics: KnockoutStatisticsDto;
  fingerprint: string;
}

export interface KnockoutCommitResultDto {
  tournamentId: string;
  createdMatchCount: number;
}

const KNOCKOUT_TOURNAMENT_INCLUDE = {
  participants: {
    where: { status: "ACTIVE" as const },
    include: {
      teamSeason: { select: { team: { select: { name: true } } } },
      group: { select: { id: true, name: true } },
    },
  },
  groups: true,
  venues: { include: { venue: { select: { id: true, name: true } } } },
} as const;

type KnockoutTournament = NonNullable<Awaited<ReturnType<PrismaClient["footballTournament"]["findUnique"]>>> & {
  participants: Array<{
    id: string;
    groupId: string | null;
    externalName: string | null;
    status: string;
    teamSeason: { team: { name: string } } | null;
    group: { id: string; name: string } | null;
  }>;
  groups: Array<{ id: string; name: string }>;
  venues: Array<{ venueId: string; venue: { id: string; name: string } }>;
};

/**
 * Builds and (on commit) persists an automatic knockout/final-round
 * bracket — Phase 13. Reuses the Phase 12 pipeline shape (pure generation
 * → validation → canonical fingerprint → preview → commit with server-side
 * re-generation + fingerprint comparison + atomic persistence) — see
 * docs/PHASE_13_TOURNAMENT_KNOCKOUT_GENERATOR_REPORT.md and ADR 0010 for
 * why pending slots (unresolved participants) need the new
 * `TournamentMatchSlot` table.
 */
@Injectable()
export class TournamentKnockoutService {
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

  private async loadTournament(db: PrismaClient, tournamentId: string): Promise<KnockoutTournament> {
    const tournament = await db.footballTournament.findUnique({
      where: { id: tournamentId },
      include: KNOCKOUT_TOURNAMENT_INCLUDE,
    });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    return tournament as unknown as KnockoutTournament;
  }

  private async assertCanManage(tenantId: string, departmentId: string) {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", departmentId)) {
      throw new ForbiddenException("Not permitted to manage this tournament's knockout bracket");
    }
  }

  /** Resolves each client-supplied entrant into a pure SlotSource, validating it belongs to this tournament. */
  private resolveEntrants(tournament: KnockoutTournament, entrants: KnockoutEntrantDto[]): SlotSource[] {
    const participantIds = new Set(tournament.participants.map((p) => p.id));
    const groupIds = new Set(tournament.groups.map((g) => g.id));
    const groupParticipantCounts = new Map<string, number>();
    for (const p of tournament.participants) {
      if (p.groupId) groupParticipantCounts.set(p.groupId, (groupParticipantCounts.get(p.groupId) ?? 0) + 1);
    }

    const seen = new Set<string>();
    const resolved: SlotSource[] = [];
    for (const entrant of entrants) {
      if (entrant.type === "TEAM") {
        if (!entrant.participantId || !participantIds.has(entrant.participantId)) {
          throw new NotFoundException("Ein angegebener Teilnehmer wurde in diesem Turnier nicht gefunden.");
        }
        const dedupeKey = `TEAM:${entrant.participantId}`;
        if (seen.has(dedupeKey)) {
          throw new BadRequestException("Derselbe Teilnehmer wurde mehrfach als KO-Setzung angegeben.");
        }
        seen.add(dedupeKey);
        resolved.push({ type: "TEAM", participantId: entrant.participantId });
      } else {
        if (!entrant.groupId || !groupIds.has(entrant.groupId)) {
          throw new NotFoundException("Eine angegebene Gruppe wurde in diesem Turnier nicht gefunden.");
        }
        if (!entrant.position) {
          throw new BadRequestException("Für eine Gruppenplatzierungs-Quelle muss eine Position angegeben werden.");
        }
        const groupSize = groupParticipantCounts.get(entrant.groupId) ?? 0;
        if (entrant.position > groupSize) {
          const group = tournament.groups.find((g) => g.id === entrant.groupId);
          throw new BadRequestException(
            `Platz ${entrant.position} existiert in Gruppe "${group?.name ?? entrant.groupId}" nicht (nur ${groupSize} Teilnehmer).`,
          );
        }
        const dedupeKey = `GROUP:${entrant.groupId}:${entrant.position}`;
        if (seen.has(dedupeKey)) {
          throw new BadRequestException("Dieselbe Gruppenplatzierung wurde mehrfach als KO-Setzung angegeben.");
        }
        seen.add(dedupeKey);
        resolved.push({ type: "GROUP_POSITION", groupId: entrant.groupId, position: entrant.position });
      }
    }
    return resolved;
  }

  private assertPreconditions(tournament: KnockoutTournament, dto: CreateKnockoutPreviewDto) {
    if (dto.entrants.length > SCHEDULE_GENERATION_LIMITS.maxKnockoutEntrants) {
      throw new BadRequestException(
        `Ein automatisch erzeugter KO-Baum darf höchstens ${SCHEDULE_GENERATION_LIMITS.maxKnockoutEntrants} Teilnehmer haben.`,
      );
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

  private resolveSettings(tournament: KnockoutTournament, dto: CreateKnockoutPreviewDto): ScheduleSettings {
    return {
      matchDurationMinutes: dto.matchDurationMinutes,
      changeoverMinutes: dto.changeoverMinutes,
      minimumRestMinutes: dto.minimumRestMinutes,
      venueIds: dto.venueIds,
      schedulingStartsAt: dto.schedulingStartsAt ? new Date(dto.schedulingStartsAt) : tournament.startsAt,
      tournamentEndsAt: tournament.endsAt,
    };
  }

  /** The full pure pipeline: entrants → bracket → dependency validation → scheduling. Same logic for preview and commit. */
  private runGenerator(
    entrants: SlotSource[],
    includeThirdPlace: boolean,
    settings: ScheduleSettings,
  ): { valid: boolean; matches: KnockoutScheduledMatch[]; conflictMessages: string[] } {
    const bracket = generateKnockoutBracket(entrants, includeThirdPlace);

    if (includeThirdPlace && !bracket.matches.some((m) => m.key === "THIRD-PLACE")) {
      return {
        valid: false,
        matches: [],
        conflictMessages: [
          "Ein Spiel um Platz 3 ist mit dieser Teilnehmerzahl/Freilos-Verteilung nicht möglich, da nicht beide Halbfinal-Partien tatsächlich ausgetragen werden.",
        ],
      };
    }

    const dependencyResult = validateKnockoutDependencyGraph(bracket.matches);
    if (!dependencyResult.valid) {
      return { valid: false, matches: [], conflictMessages: dependencyResult.conflicts.map((c) => c.message) };
    }

    const scheduled = scheduleKnockoutBracket(bracket.matches, settings);
    if (!scheduled.valid) {
      return { valid: false, matches: [], conflictMessages: scheduled.conflicts.map((c) => c.message) };
    }

    return { valid: true, matches: scheduled.matches, conflictMessages: [] };
  }

  private describeSource(source: SlotSource, tournament: KnockoutTournament, matchByKey: Map<string, { round: KnockoutRound }>): string {
    if (source.type === "TEAM") {
      const participant = tournament.participants.find((p) => p.id === source.participantId);
      return participant?.teamSeason?.team.name ?? participant?.externalName ?? "Unbekannter Teilnehmer";
    }
    if (source.type === "GROUP_POSITION") {
      const group = tournament.groups.find((g) => g.id === source.groupId);
      return `${group?.name ?? "Unbekannte Gruppe"}, Platz ${source.position}`;
    }
    const sourceMatch = matchByKey.get(source.matchKey);
    const roundLabel = sourceMatch ? GERMAN_ROUND_LABELS[sourceMatch.round] : source.matchKey;
    const verb = source.type === "WINNER_OF_MATCH" ? "Sieger" : "Verlierer";
    // Append the match's per-round index (e.g. "SF-2" -> "2") so that two
    // sources from the same round — e.g. both semifinal winners feeding the
    // Final — stay distinguishable. A round that's ever referenced this way
    // always has >= 2 matches (it only exists to feed pairs into the next
    // round), so the index is always meaningful here.
    const matchIndex = source.matchKey.match(/-(\d+)$/)?.[1];
    return matchIndex ? `${verb} ${roundLabel} ${matchIndex}` : `${verb} ${roundLabel}`;
  }

  private buildStatistics(matches: KnockoutScheduledMatch[], entrantCount: number): KnockoutStatisticsDto {
    const starts = matches.map((m) => m.startsAt.getTime());
    const ends = matches.map((m) => m.endsAt.getTime());
    const firstMatchAt = starts.length > 0 ? new Date(Math.min(...starts)) : null;
    const lastMatchEndsAt = ends.length > 0 ? new Date(Math.max(...ends)) : null;
    const rounds = [...new Set(matches.map((m) => GERMAN_ROUND_LABELS[m.round]))];
    return {
      totalMatches: matches.length,
      totalEntrants: entrantCount,
      rounds,
      firstMatchAt: firstMatchAt?.toISOString() ?? null,
      lastMatchEndsAt: lastMatchEndsAt?.toISOString() ?? null,
      tournamentDurationMinutes: firstMatchAt && lastMatchEndsAt ? Math.round((lastMatchEndsAt.getTime() - firstMatchAt.getTime()) / 60_000) : null,
    };
  }

  private toMatchDtos(matches: KnockoutScheduledMatch[], tournament: KnockoutTournament): KnockoutMatchDto[] {
    const matchByKey = new Map(matches.map((m) => [m.key, m]));
    const venueNames = new Map(tournament.venues.map((v) => [v.venueId, v.venue.name]));
    return matches
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((m) => ({
        key: m.key,
        round: m.round,
        homeLabel: this.describeSource(m.home, tournament, matchByKey),
        awayLabel: this.describeSource(m.away, tournament, matchByKey),
        venueId: m.venueId,
        venueName: venueNames.get(m.venueId) ?? m.venueId,
        startsAt: m.startsAt.toISOString(),
        endsAt: m.endsAt.toISOString(),
      }));
  }

  private computeFingerprint(
    tournament: KnockoutTournament,
    dto: CreateKnockoutPreviewDto,
    entrants: SlotSource[],
    settings: ScheduleSettings,
    matches: KnockoutScheduledMatch[],
  ): string {
    return computeKnockoutFingerprint({
      tournament: {
        id: tournament.id,
        startsAt: tournament.startsAt.toISOString(),
        endsAt: tournament.endsAt?.toISOString() ?? null,
        mode: tournament.mode,
      },
      entrants: entrants.map((source, index) => ({ seed: index + 1, source })),
      includeThirdPlace: dto.includeThirdPlace,
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

  async preview(tournamentId: string, dto: CreateKnockoutPreviewDto): Promise<KnockoutPreviewDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const tournament = await this.loadTournament(db, tournamentId);
    await this.assertCanManage(context.tenantId, tournament.departmentId);

    this.assertPreconditions(tournament, dto);
    const entrants = this.resolveEntrants(tournament, dto.entrants);
    const settings = this.resolveSettings(tournament, dto);

    const { valid, matches, conflictMessages } = this.runGenerator(entrants, dto.includeThirdPlace, settings);
    const fingerprint = this.computeFingerprint(tournament, dto, entrants, settings, matches);

    return {
      tournamentId: tournament.id,
      generatedAt: new Date().toISOString(),
      generatorVersion: KNOCKOUT_GENERATOR_VERSION,
      includeThirdPlace: dto.includeThirdPlace,
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
      statistics: this.buildStatistics(matches, entrants.length),
      fingerprint,
    };
  }

  async commit(tournamentId: string, dto: CreateKnockoutCommitDto): Promise<KnockoutCommitResultDto> {
    const context = this.requireContext();

    const preflightDb = getTenantPrisma(context.tenantId);
    const preflightTournament = await this.loadTournament(preflightDb, tournamentId);
    await this.assertCanManage(context.tenantId, preflightTournament.departmentId);

    return withTenantTransaction(context.tenantId, async (tx) => {
      // Same row-lock strategy as the Phase 12 round-robin commit (ADR
      // 0009) — serializes concurrent commits for the same tournament.
      await tx.$queryRaw`SELECT id FROM football_tournament WHERE id = ${tournamentId} FOR UPDATE`;

      const db = tx as unknown as PrismaClient;
      const tournament = await this.loadTournament(db, tournamentId);

      // A tournament may have at most ONE persisted schedule total — this
      // guard is deliberately not specific to round-robin vs. knockout:
      // committing a knockout bracket on top of an already-committed
      // group-stage schedule (or vice versa) would create an inconsistent,
      // unreviewable mix. See PHASE_13 report.
      const existingMatchCount = await db.footballMatch.count({ where: { tournamentId } });
      if (existingMatchCount > 0) {
        throw new ConflictException("Für dieses Turnier existiert bereits ein Spielplan.");
      }

      this.assertPreconditions(tournament, dto);
      const entrants = this.resolveEntrants(tournament, dto.entrants);
      const settings = this.resolveSettings(tournament, dto);

      const { valid, matches, conflictMessages } = this.runGenerator(entrants, dto.includeThirdPlace, settings);
      if (!valid) {
        throw new ConflictException(`Der KO-Baum kann mit den aktuellen Einstellungen nicht erstellt werden: ${conflictMessages.join(" ")}`);
      }

      const freshFingerprint = this.computeFingerprint(tournament, dto, entrants, settings, matches);
      if (freshFingerprint !== dto.fingerprint) {
        throw new ConflictException("Das Turnier wurde seit der Vorschau geändert. Bitte den KO-Baum neu berechnen.");
      }

      // Pre-generate every match's DB id so WINNER_OF_MATCH/LOSER_OF_MATCH
      // dependencies (and the slot rows referencing their owning match)
      // can be written in a single pass — Prisma's @default(uuid()) is
      // generated client-side anyway, so this changes nothing about how
      // IDs are produced, just lets us know them before the insert.
      const matchIdByKey = new Map(matches.map((m) => [m.key, randomUUID()]));

      await db.footballMatch.createMany({
        data: matches.map((m) => ({
          id: matchIdByKey.get(m.key)!,
          tenantId: context.tenantId,
          tournamentId: tournament.id,
          tournamentGroupId: null,
          homeParticipantId: m.home.type === "TEAM" ? m.home.participantId : null,
          awayParticipantId: m.away.type === "TEAM" ? m.away.participantId : null,
          venueId: m.venueId,
          startsAt: m.startsAt,
          type: "TOURNAMENT" as const,
          status: "SCHEDULED" as const,
          homeAway: "NEUTRAL" as const,
        })),
      });

      const slotData: Array<{
        id: string;
        tenantId: string;
        tournamentId: string;
        matchId: string;
        side: "HOME" | "AWAY";
        sourceType: "GROUP_POSITION" | "WINNER_OF_MATCH" | "LOSER_OF_MATCH";
        groupId: string | null;
        groupPosition: number | null;
        sourceMatchId: string | null;
      }> = [];
      for (const m of matches) {
        for (const [side, source] of [
          ["HOME", m.home],
          ["AWAY", m.away],
        ] as const) {
          if (source.type === "TEAM") continue;
          slotData.push({
            id: randomUUID(),
            tenantId: context.tenantId,
            tournamentId: tournament.id,
            matchId: matchIdByKey.get(m.key)!,
            side,
            sourceType: source.type,
            groupId: source.type === "GROUP_POSITION" ? source.groupId : null,
            groupPosition: source.type === "GROUP_POSITION" ? source.position : null,
            sourceMatchId: source.type !== "GROUP_POSITION" ? matchIdByKey.get(source.matchKey)! : null,
          });
        }
      }
      if (slotData.length > 0) {
        await db.tournamentMatchSlot.createMany({ data: slotData });
      }

      return { tournamentId: tournament.id, createdMatchCount: matches.length };
    });
  }
}
