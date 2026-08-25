import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, SportType } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

export interface DepartmentListItemDto {
  id: string;
  name: string;
  sportType: SportType;
  canEdit: boolean;
}

export interface DepartmentDetailDto extends DepartmentListItemDto {
  canCreateTeams: boolean;
}

export interface DepartmentListResponse {
  items: DepartmentListItemDto[];
  canCreate: boolean;
}

@Injectable()
export class DepartmentsService {
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

  async list(): Promise<DepartmentListResponse> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const all = await db.department.findMany({ orderBy: { name: "asc" } });
    const items = all
      .filter((d) => this.authz.canOnDepartment(assignments, "read", d.id))
      .map((d) => ({
        id: d.id,
        name: d.name,
        sportType: d.sportType,
        canEdit: this.authz.canOnDepartment(assignments, "update", d.id),
      }));
    return { items, canCreate: this.authz.canOnDepartment(assignments, "create") };
  }

  async getById(id: string): Promise<DepartmentDetailDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnDepartment(assignments, "read", id)) {
      throw new ForbiddenException("Not permitted to read this department");
    }
    const db = getTenantPrisma(context.tenantId);
    const department = await db.department.findUnique({ where: { id } });
    if (!department) {
      throw new NotFoundException("Department not found");
    }
    return {
      id: department.id,
      name: department.name,
      sportType: department.sportType,
      canEdit: this.authz.canOnDepartment(assignments, "update", id),
      canCreateTeams: this.authz.canOnTeam(assignments, "create", { departmentId: id }),
    };
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentDetailDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnDepartment(assignments, "create")) {
      throw new ForbiddenException("Not permitted to create departments");
    }
    const db = getTenantPrisma(context.tenantId);
    const department = await db.department.create({
      data: { tenantId: context.tenantId, name: dto.name },
    });
    return {
      id: department.id,
      name: department.name,
      sportType: department.sportType,
      canEdit: true,
      canCreateTeams: true,
    };
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<DepartmentDetailDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnDepartment(assignments, "update", id)) {
      throw new ForbiddenException("Not permitted to update this department");
    }
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Department not found");
    }
    const department = await db.department.update({ where: { id }, data: { name: dto.name } });
    return {
      id: department.id,
      name: department.name,
      sportType: department.sportType,
      canEdit: true,
      canCreateTeams: this.authz.canOnTeam(assignments, "create", { departmentId: id }),
    };
  }
}
