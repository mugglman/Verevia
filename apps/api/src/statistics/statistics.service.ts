import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { getTenantContext, getTenantPrisma } from "@verevia/database";
import { AttendancesService } from "../attendances/attendances.service";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { EventsService } from "../events/events.service";
import {
  computeAttendanceStatistics,
  computeMatchStatistics,
  type AttendanceStatistics,
  type MatchStatistics,
} from "./statistics.calculations";

/**
 * Einfache Team-/Saisonstatistik (Phase 21) — siehe
 * docs/PHASE_21_STATISTICS_REPORT.md für die vollständige Herleitung und
 * die Berechnungsdefinitionen (insbesondere die Anwesenheitsquote und die
 * Saison-Abgrenzung von `Event`, das keine eigene `teamSeasonId` trägt).
 * Die eigentliche Berechnung ist DB-frei in `statistics.calculations.ts`
 * (unabhängig unit-testbar, gleiches Muster wie `group-standings.ts`,
 * Phase 16) — dieser Service lädt nur die Rohdaten und prüft die
 * Berechtigung.
 *
 * Bewusst KEINE neue Authorization-Methode und KEINE zweite
 * Spiel-/Anwesenheitslogik: die Sichtbarkeitsprüfung reicht `canOnMatch`
 * unverändert durch (dieselbe Regel, die bereits `FootballMatch`/`Event`
 * team-scoped verwenden), und die Anwesenheitsdaten werden ausschließlich
 * durch Wiederverwendung von `EventsService.list`/`AttendancesService.list`
 * gewonnen (Phase 18/19, unverändert) — inklusive deren bereits etablierter
 * Roster-Synthese (ein Kadermitglied ohne eigene Attendance-Zeile
 * erscheint dort bereits korrekt als `PENDING`/`attended: null`).
 */
export interface TeamSeasonStatisticsDto {
  teamSeasonId: string;
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonName: string;
  matches: MatchStatistics;
  attendance: AttendanceStatistics;
}

@Injectable()
export class StatisticsService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
    private readonly eventsService: EventsService,
    private readonly attendancesService: AttendancesService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  async getTeamSeasonStatistics(teamSeasonId: string): Promise<TeamSeasonStatisticsDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    const teamSeason = await db.teamSeason.findUnique({
      where: { id: teamSeasonId },
      include: {
        team: { select: { id: true, name: true, departmentId: true } },
        season: { select: { id: true, name: true, startsAt: true, endsAt: true } },
      },
    });
    if (!teamSeason) {
      throw new NotFoundException("Team season not found");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnMatch(assignments, "read", {
        teamId: teamSeason.teamId,
        departmentId: teamSeason.team.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to read statistics for this team season");
    }

    // Spielbilanz: "gespielt" = MatchStatus.COMPLETED, die bereits etablierte
    // Definition (siehe match-foundation) — keine zweite Definition. Der
    // Filter auf `teamSeasonId` schließt Turniermatches (teamSeasonId immer
    // NULL dort, siehe Event-Modellkommentar in schema.prisma) strukturell
    // aus, ohne einen zusätzlichen `type`-Filter zu benötigen.
    const matchRows = await db.footballMatch.findMany({
      where: { teamSeasonId, status: "COMPLETED" },
      select: { homeAway: true, homeScore: true, awayScore: true },
    });
    const matches = computeMatchStatistics(matchRows);

    // Anwesenheit: Event trägt keine eigene teamSeasonId (bewusst
    // sportneutral, siehe Event-Modellkommentar) — "relevante Termine"
    // werden daher über Team + den Datumsbereich der Saison abgegrenzt
    // (siehe PHASE_21_STATISTICS_REPORT.md, "Berechnungsdefinitionen").
    // Reine Wiederverwendung von EventsService.list — keine eigene
    // Team-/Datums-Filterlogik.
    const eventsResponse = await this.eventsService.list({
      teamId: teamSeason.teamId,
      from: teamSeason.season.startsAt.toISOString(),
      to: teamSeason.season.endsAt.toISOString(),
    });

    // Parallel statt sequenziell — vermeidet eine unnötige serielle
    // Wartekette über potenziell viele Termine (siehe Abschnitt 20 des
    // Arbeitsauftrags), jeder einzelne Aufruf bleibt eine schlanke,
    // bereits vorhandene Abfrage (keine echte N+1-Situation).
    const attendanceResponses = await Promise.all(
      eventsResponse.items.map((event) => this.attendancesService.list(event.id)),
    );
    const attendanceRecords = attendanceResponses.flatMap((response) =>
      response.items.map((item) => ({ rsvpStatus: item.rsvpStatus, attended: item.attended })),
    );
    const attendance = computeAttendanceStatistics(eventsResponse.items.length, attendanceRecords);

    return {
      teamSeasonId: teamSeason.id,
      teamId: teamSeason.teamId,
      teamName: teamSeason.team.name,
      seasonId: teamSeason.seasonId,
      seasonName: teamSeason.season.name,
      matches,
      attendance,
    };
  }
}
