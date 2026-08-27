import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma, VenueStatus } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { ListVenuesQueryDto } from "./dto/list-venues-query.dto";
import { UpdateVenueDto } from "./dto/update-venue.dto";

export interface VenueDto {
  id: string;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  status: VenueStatus;
  canEdit: boolean;
}

export interface VenueListResponse {
  items: VenueDto[];
  canCreate: boolean;
}

@Injectable()
export class VenuesService {
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
    venue: {
      id: string;
      name: string;
      street: string | null;
      postalCode: string | null;
      city: string | null;
      countryCode: string | null;
      latitude: number | null;
      longitude: number | null;
      notes: string | null;
      status: VenueStatus;
    },
    canEdit: boolean,
  ): VenueDto {
    return {
      id: venue.id,
      name: venue.name,
      street: venue.street,
      postalCode: venue.postalCode,
      city: venue.city,
      countryCode: venue.countryCode,
      latitude: venue.latitude,
      longitude: venue.longitude,
      notes: venue.notes,
      status: venue.status,
      canEdit,
    };
  }

  async list(query: ListVenuesQueryDto): Promise<VenueListResponse> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnVenue(assignments, "read")) {
      throw new ForbiddenException("Not permitted to read venues");
    }
    const db = getTenantPrisma(context.tenantId);
    const venues = await db.venue.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { name: "asc" },
    });
    const canEdit = this.authz.canOnVenue(assignments, "update");
    return {
      items: venues.map((v) => this.toDto(v, canEdit)),
      canCreate: this.authz.canOnVenue(assignments, "create"),
    };
  }

  async getById(id: string): Promise<VenueDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnVenue(assignments, "read")) {
      throw new ForbiddenException("Not permitted to read venues");
    }
    const db = getTenantPrisma(context.tenantId);
    const venue = await db.venue.findUnique({ where: { id } });
    if (!venue) {
      throw new NotFoundException("Venue not found");
    }
    return this.toDto(venue, this.authz.canOnVenue(assignments, "update"));
  }

  async create(dto: CreateVenueDto): Promise<VenueDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnVenue(assignments, "create")) {
      throw new ForbiddenException("Not permitted to create venues");
    }
    const db = getTenantPrisma(context.tenantId);
    try {
      const venue = await db.venue.create({
        data: {
          tenantId: context.tenantId,
          name: dto.name,
          street: dto.street,
          postalCode: dto.postalCode,
          city: dto.city,
          countryCode: dto.countryCode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          notes: dto.notes,
          status: dto.status ?? "ACTIVE",
        },
      });
      return this.toDto(venue, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A venue with this name already exists");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateVenueDto): Promise<VenueDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnVenue(assignments, "update")) {
      throw new ForbiddenException("Not permitted to update venues");
    }
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.venue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Venue not found");
    }
    try {
      const venue = await db.venue.update({
        where: { id },
        data: {
          name: dto.name,
          street: dto.street,
          postalCode: dto.postalCode,
          city: dto.city,
          countryCode: dto.countryCode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          notes: dto.notes,
          status: dto.status,
        },
      });
      return this.toDto(venue, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A venue with this name already exists");
      }
      throw error;
    }
  }
}
