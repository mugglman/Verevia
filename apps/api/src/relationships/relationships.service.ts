import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRelationshipsAuthService } from "../authorization/person-relationships-auth.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateRelationshipDto } from "./dto/create-relationship.dto";

export interface MyChildDto {
  id: string;
  firstName: string;
  lastName: string;
}

export interface RelationshipDto {
  id: string;
  type: string;
  status: string;
  /**
   * AS_GUARDIAN: the requested Person is `fromPerson` (guardian of
   * `otherPerson`). AS_CHILD: the requested Person is `toPerson`
   * (`otherPerson` is their guardian). A person's relationships list
   * shows both directions (Phase 6, section 22).
   */
  direction: "AS_GUARDIAN" | "AS_CHILD";
  otherPersonId: string;
  otherPersonFirstName: string;
  otherPersonLastName: string;
}

/**
 * Administrative relationship management (TENANT_ADMIN-only, Phase 6,
 * section 16). Creating a relationship here IS the "administrative
 * verification" — status is set to VERIFIED immediately, since only an
 * already-authorized TENANT_ADMIN can call this. This is explicitly NOT a
 * legal identity check (see PHASE_6_GUARDIAN_INVITATIONS_REPORT.md,
 * Datenschutz-TODOs) — it only grants the relationship-based read access
 * implemented in AuthorizationService.canAccessPersonAsSelfOrGuardian.
 */
@Injectable()
export class RelationshipsService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
    private readonly relationshipsAuth: PersonRelationshipsAuthService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  private async requireManageAccess(tenantId: string, callerPersonId: string): Promise<void> {
    const assignments = await this.roleAssignments.load(tenantId, callerPersonId);
    if (!this.authz.canManageRelationships(assignments)) {
      throw new ForbiddenException("Not permitted to manage relationships");
    }
  }

  async list(personId: string): Promise<RelationshipDto[]> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);

    const db = getTenantPrisma(context.tenantId);
    const person = await db.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException("Person not found");
    }

    const relationships = await db.personRelationship.findMany({
      where: { OR: [{ fromPersonId: personId }, { toPersonId: personId }] },
      include: {
        fromPerson: { select: { id: true, firstName: true, lastName: true } },
        toPerson: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return relationships.map((r) => {
      const asGuardian = r.fromPersonId === personId;
      const other = asGuardian ? r.toPerson : r.fromPerson;
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        direction: asGuardian ? "AS_GUARDIAN" : "AS_CHILD",
        otherPersonId: other.id,
        otherPersonFirstName: other.firstName,
        otherPersonLastName: other.lastName,
      };
    });
  }

  async create(personId: string, dto: CreateRelationshipDto): Promise<RelationshipDto> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);

    if (personId === dto.toPersonId) {
      throw new BadRequestException("A person cannot be their own guardian");
    }

    const db = getTenantPrisma(context.tenantId);
    const [fromPerson, toPerson] = await Promise.all([
      db.person.findUnique({ where: { id: personId } }),
      db.person.findUnique({ where: { id: dto.toPersonId } }),
    ]);
    if (!fromPerson) {
      throw new NotFoundException("Person not found");
    }
    if (!toPerson) {
      throw new NotFoundException("Target person not found");
    }

    const created = await db.personRelationship.create({
      data: {
        tenantId: context.tenantId,
        fromPersonId: personId,
        toPersonId: dto.toPersonId,
        type: dto.type,
        status: "VERIFIED",
        isLegalGuardian: dto.type === "LEGAL_GUARDIAN",
        verifiedByPersonId: context.personId,
      },
    });

    return {
      id: created.id,
      type: created.type,
      status: created.status,
      direction: "AS_GUARDIAN",
      otherPersonId: toPerson.id,
      otherPersonFirstName: toPerson.firstName,
      otherPersonLastName: toPerson.lastName,
    };
  }

  async revoke(personId: string, relationshipId: string): Promise<void> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);

    const db = getTenantPrisma(context.tenantId);
    const relationship = await db.personRelationship.findUnique({ where: { id: relationshipId } });
    if (
      !relationship ||
      (relationship.fromPersonId !== personId && relationship.toPersonId !== personId)
    ) {
      throw new NotFoundException("Relationship not found");
    }
    // Soft removal (status → REVOKED), consistent with TeamMember's
    // pattern — never deletes the Person, keeps the relationship
    // discoverable for audit purposes (Phase 6, section 14: "Keine
    // Person löschen").
    await db.personRelationship.update({
      where: { id: relationshipId },
      data: { status: "REVOKED" },
    });
  }

  /**
   * SELF-scoped (Phase 6, sections 17/19/28) — no RBAC check at all,
   * deliberately: any authenticated tenant member may see their OWN
   * verified guardian children, that is exactly the ReBAC access path
   * this endpoint exists to serve. Never returns anyone else's children.
   */
  async listMyChildren(): Promise<MyChildDto[]> {
    const context = this.requireContext();
    const relationships = await this.relationshipsAuth.loadAsGuardian(
      context.tenantId,
      context.personId!,
    );
    const childIds = this.authz.getGuardianChildPersonIds(relationships);
    if (childIds.length === 0) return [];

    const db = getTenantPrisma(context.tenantId);
    const children = await db.person.findMany({
      where: { id: { in: childIds } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return children;
  }
}
