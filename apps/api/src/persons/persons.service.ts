import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreatePersonDto } from "./dto/create-person.dto";
import { UpdatePersonDto } from "./dto/update-person.dto";

export interface PersonDto {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  canEdit: boolean;
}

export interface PersonListDto {
  items: PersonDto[];
  canCreate: boolean;
}

@Injectable()
export class PersonsService {
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

  private toDto(
    person: {
      id: string;
      firstName: string;
      lastName: string;
      birthDate: Date | null;
      contactEmail: string | null;
      contactPhone: string | null;
    },
    canEdit: boolean,
  ): PersonDto {
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      birthDate: person.birthDate ? person.birthDate.toISOString() : null,
      contactEmail: person.contactEmail,
      contactPhone: person.contactPhone,
      canEdit,
    };
  }

  async list(): Promise<PersonListDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canListPersons(assignments)) {
      throw new ForbiddenException("Not permitted to list persons");
    }
    const canEdit = this.authz.canOnPerson(assignments, "update");
    const db = getTenantPrisma(context.tenantId);

    // Phase 5, section 24: DEPARTMENT_ADMIN sees only persons associated
    // (via TeamMember, any status) with a team of their own department(s)
    // — not the whole tenant. A non-empty managed-department list implies
    // the caller is a DEPARTMENT_ADMIN, not a TENANT_ADMIN (canListPersons
    // above already rejected anyone else); TENANT_ADMIN stays unrestricted.
    const managedDepartmentIds = this.authz.getManagedDepartmentIds(assignments);
    const where =
      managedDepartmentIds.length > 0
        ? { teamMemberships: { some: { team: { departmentId: { in: managedDepartmentIds } } } } }
        : undefined;

    const persons = await db.person.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return {
      items: persons.map((p) => this.toDto(p, canEdit)),
      canCreate: this.authz.canOnPerson(assignments, "create"),
    };
  }

  async getById(id: string): Promise<PersonDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canListPersons(assignments)) {
      throw new ForbiddenException("Not permitted to read this person");
    }
    const db = getTenantPrisma(context.tenantId);
    const person = await db.person.findUnique({ where: { id } });
    if (!person) {
      throw new NotFoundException("Person not found");
    }
    return this.toDto(person, this.authz.canOnPerson(assignments, "update"));
  }

  async create(dto: CreatePersonDto): Promise<PersonDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnPerson(assignments, "create")) {
      throw new ForbiddenException("Not permitted to create a person");
    }
    const db = getTenantPrisma(context.tenantId);
    const person = await db.person.create({
      data: {
        tenantId: context.tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
      },
    });
    return this.toDto(person, true);
  }

  async update(id: string, dto: UpdatePersonDto): Promise<PersonDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.person.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Person not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnPerson(assignments, "update")) {
      throw new ForbiddenException("Not permitted to update this person");
    }
    const person = await db.person.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
      },
    });
    return this.toDto(person, true);
  }
}
