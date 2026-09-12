import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { EventType, RsvpStatus, getTenantContext, getTenantPrisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRelationshipsAuthService } from "../authorization/person-relationships-auth.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { EventsService, type EventWithRelations } from "../events/events.service";
import { MarkAttendedDto } from "./dto/mark-attended.dto";
import { SetRsvpDto } from "./dto/set-rsvp.dto";

/**
 * Zu-/Absage und tatsächliche Anwesenheit einer Person zu einem Event
 * (Phase 19) — siehe docs/database/Database.md, Entität "Attendance", und
 * [ADR 0015](../../../../docs/architecture/adr/0015-attendance-self-service-authorization.md)
 * für die vollständige Autorisierungs-Begründung.
 *
 * Zwei koexistierende Zugriffspfade, keine neue Authorization-Engine:
 *
 *   1. RBAC (Organisator): dieselbe `EventsService.canAccess`-Funktion wie
 *      für das Event selbst — wer das Event bearbeiten darf, darf auch
 *      Anwesenheiten für JEDE Person auf dem Roster verwalten (RSVP
 *      überschreiben, tatsächliche Anwesenheit erfassen).
 *   2. Self-Service (Betroffene Person oder ihr verifizierter
 *      Erziehungsberechtigter): darf ausschließlich die EIGENE bzw. eines
 *      Kindes RSVP setzen — niemals `attended` (das ist ausschließlich die
 *      Organisator-Feststellung im Nachhinein) — und nur, wenn die
 *      Zielperson tatsächlich auf dem Roster des Events steht.
 *
 * "Roster" ist bewusst unterschiedlich definiert je nach Event-Scope, da
 * das Datenmodell keine generische Mitgliederliste kennt:
 *   - Team-Event: aktive `TeamMember` dieses Teams (die fachlich korrekte
 *     Mannschaftszugehörigkeit, siehe TeamMember-Modellkommentar) — NICHT
 *     `RoleAssignment` (ein gewöhnlicher Spieler hat oft nur `TeamMember`,
 *     keine RoleAssignment, siehe seed.ts).
 *   - Department-Event: jede Person mit einer RoleAssignment, die
 *     `canOnSeason(read, departmentId)` erfüllt (Admins/Trainer) — es gibt
 *     kein "DepartmentMember"-Äquivalent zu TeamMember im Datenmodell.
 */
export interface AttendanceItemDto {
  personId: string;
  personName: string;
  rsvpStatus: RsvpStatus;
  rsvpNote: string | null;
  attended: boolean | null;
  isSelfOrGuardianTarget: boolean;
}

export interface AttendanceEventContextDto {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: string;
  endsAt: string;
  teamName: string | null;
  departmentName: string | null;
  venueName: string | null;
}

export interface AttendanceListResponse {
  event: AttendanceEventContextDto;
  items: AttendanceItemDto[];
  canManageAttendance: boolean;
}

interface RosterMember {
  personId: string;
  personName: string;
}

@Injectable()
export class AttendancesService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
    private readonly relationshipsAuth: PersonRelationshipsAuthService,
    private readonly eventsService: EventsService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  private async loadEventOrThrow(eventId: string): Promise<EventWithRelations> {
    const event = await this.eventsService.findRaw(eventId);
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    return event;
  }

  /** Self plus every VERIFIED PARENT/LEGAL_GUARDIAN child (Phase 6 ReBAC path). */
  private async selfAndGuardianChildIds(tenantId: string, personId: string): Promise<string[]> {
    const relationships = await this.relationshipsAuth.loadAsGuardian(tenantId, personId);
    return [personId, ...this.authz.getGuardianChildPersonIds(relationships)];
  }

  private async isEligibleTarget(tenantId: string, personId: string, event: EventWithRelations): Promise<boolean> {
    const db = getTenantPrisma(tenantId);
    if (event.teamId) {
      const member = await db.teamMember.findFirst({
        where: { teamId: event.teamId, personId, status: "ACTIVE" },
      });
      return !!member;
    }
    const assignments = await this.roleAssignments.load(tenantId, personId);
    return this.authz.canOnSeason(assignments, "read", event.departmentId!);
  }

  private async loadRoster(tenantId: string, event: EventWithRelations): Promise<RosterMember[]> {
    const db = getTenantPrisma(tenantId);
    if (event.teamId) {
      const members = await db.teamMember.findMany({
        where: { teamId: event.teamId, status: "ACTIVE" },
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      return members.map((m) => ({ personId: m.personId, personName: `${m.person.firstName} ${m.person.lastName}` }));
    }

    const assignments = await db.roleAssignment.findMany({
      where: {
        OR: [
          { scopeType: "DEPARTMENT", departmentId: event.departmentId },
          { scopeType: "TEAM", team: { departmentId: event.departmentId! } },
        ],
      },
      include: { person: { select: { firstName: true, lastName: true } } },
    });
    const byPersonId = new Map<string, RosterMember>();
    for (const ra of assignments) {
      byPersonId.set(ra.personId, {
        personId: ra.personId,
        personName: `${ra.person.firstName} ${ra.person.lastName}`,
      });
    }
    return [...byPersonId.values()];
  }

  private toEventContext(event: EventWithRelations): AttendanceEventContextDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      teamName: event.team?.name ?? null,
      departmentName: event.department?.name ?? null,
      venueName: event.venue?.name ?? null,
    };
  }

  async list(eventId: string): Promise<AttendanceListResponse> {
    const context = this.requireContext();
    const event = await this.loadEventOrThrow(eventId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const rbacRead = this.eventsService.canAccess(assignments, event, "read");
    const canManageAttendance = this.eventsService.canAccess(assignments, event, "update");

    const selfIds = await this.selfAndGuardianChildIds(context.tenantId, context.personId!);
    const roster = await this.loadRoster(context.tenantId, event);
    const selfTargetIds = new Set(roster.map((r) => r.personId).filter((id) => selfIds.includes(id)));

    if (!rbacRead && selfTargetIds.size === 0) {
      throw new ForbiddenException("Not permitted to read attendance for this event");
    }

    const db = getTenantPrisma(context.tenantId);
    const existing = await db.attendance.findMany({
      where: { eventId, personId: { in: roster.map((r) => r.personId) } },
    });
    const byPersonId = new Map(existing.map((a) => [a.personId, a]));

    const items: AttendanceItemDto[] = roster
      .sort((a, b) => a.personName.localeCompare(b.personName, "de"))
      .map((member) => {
        const row = byPersonId.get(member.personId);
        return {
          personId: member.personId,
          personName: member.personName,
          rsvpStatus: row?.rsvpStatus ?? "PENDING",
          rsvpNote: row?.rsvpNote ?? null,
          attended: row?.attended ?? null,
          isSelfOrGuardianTarget: selfTargetIds.has(member.personId),
        };
      });

    return { event: this.toEventContext(event), items, canManageAttendance };
  }

  async setRsvp(eventId: string, personId: string, dto: SetRsvpDto): Promise<AttendanceItemDto> {
    const context = this.requireContext();
    const event = await this.loadEventOrThrow(eventId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const canManage = this.eventsService.canAccess(assignments, event, "update");

    if (!canManage) {
      const selfIds = await this.selfAndGuardianChildIds(context.tenantId, context.personId!);
      if (!selfIds.includes(personId)) {
        throw new ForbiddenException("Not permitted to set attendance for this person");
      }
      if (!(await this.isEligibleTarget(context.tenantId, personId, event))) {
        throw new BadRequestException("Person is not part of this event's roster");
      }
    } else if (!(await this.isEligibleTarget(context.tenantId, personId, event))) {
      throw new BadRequestException("Person is not part of this event's roster");
    }

    const db = getTenantPrisma(context.tenantId);
    const row = await db.attendance.upsert({
      where: { eventId_personId: { eventId, personId } },
      update: { rsvpStatus: dto.status, rsvpNote: dto.note ?? null, respondedByPersonId: context.personId! },
      create: {
        tenantId: context.tenantId,
        eventId,
        personId,
        rsvpStatus: dto.status,
        rsvpNote: dto.note ?? null,
        respondedByPersonId: context.personId!,
      },
      include: { person: { select: { firstName: true, lastName: true } } },
    });

    return {
      personId: row.personId,
      personName: `${row.person.firstName} ${row.person.lastName}`,
      rsvpStatus: row.rsvpStatus,
      rsvpNote: row.rsvpNote,
      attended: row.attended,
      isSelfOrGuardianTarget: true,
    };
  }

  async markAttended(eventId: string, personId: string, dto: MarkAttendedDto): Promise<AttendanceItemDto> {
    const context = this.requireContext();
    const event = await this.loadEventOrThrow(eventId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.eventsService.canAccess(assignments, event, "update")) {
      throw new ForbiddenException("Not permitted to record attendance for this event");
    }
    if (!(await this.isEligibleTarget(context.tenantId, personId, event))) {
      throw new BadRequestException("Person is not part of this event's roster");
    }

    const db = getTenantPrisma(context.tenantId);
    const row = await db.attendance.upsert({
      where: { eventId_personId: { eventId, personId } },
      update: { attended: dto.attended, recordedByPersonId: context.personId! },
      create: {
        tenantId: context.tenantId,
        eventId,
        personId,
        attended: dto.attended,
        recordedByPersonId: context.personId!,
      },
      include: { person: { select: { firstName: true, lastName: true } } },
    });

    const selfIds = await this.selfAndGuardianChildIds(context.tenantId, context.personId!);

    return {
      personId: row.personId,
      personName: `${row.person.firstName} ${row.person.lastName}`,
      rsvpStatus: row.rsvpStatus,
      rsvpNote: row.rsvpNote,
      attended: row.attended,
      isSelfOrGuardianTarget: selfIds.includes(row.personId),
    };
  }
}
