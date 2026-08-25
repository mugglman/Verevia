import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma } from "@verevia/database";
import { AuthorizationService } from "../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../authorization/person-role-assignments.service";
import { CreateAgeGroupDto } from "./dto/create-age-group.dto";
import { UpdateAgeGroupDto } from "./dto/update-age-group.dto";

export interface AgeGroupDto {
  id: string;
  name: string;
  sortOrder: number;
  canEdit: boolean;
}

@Injectable()
export class AgeGroupsService {
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

  private toDto(ageGroup: { id: string; name: string; sortOrder: number }, canEdit: boolean): AgeGroupDto {
    return { id: ageGroup.id, name: ageGroup.name, sortOrder: ageGroup.sortOrder, canEdit };
  }

  async list(): Promise<AgeGroupDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canReadAgeGroups(assignments)) {
      throw new ForbiddenException("Not permitted to read age groups");
    }
    const db = getTenantPrisma(context.tenantId);
    const ageGroups = await db.ageGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const canEdit = this.authz.canManageAgeGroups(assignments);
    return ageGroups.map((a) => this.toDto(a, canEdit));
  }

  async create(dto: CreateAgeGroupDto): Promise<AgeGroupDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canManageAgeGroups(assignments)) {
      throw new ForbiddenException("Not permitted to manage age groups");
    }
    const db = getTenantPrisma(context.tenantId);
    try {
      const ageGroup = await db.ageGroup.create({
        data: { tenantId: context.tenantId, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
      });
      return this.toDto(ageGroup, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An age group with this name already exists");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateAgeGroupDto): Promise<AgeGroupDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canManageAgeGroups(assignments)) {
      throw new ForbiddenException("Not permitted to manage age groups");
    }
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.ageGroup.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Age group not found");
    }
    try {
      const ageGroup = await db.ageGroup.update({
        where: { id },
        data: { name: dto.name, sortOrder: dto.sortOrder },
      });
      return this.toDto(ageGroup, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An age group with this name already exists");
      }
      throw error;
    }
  }
}
