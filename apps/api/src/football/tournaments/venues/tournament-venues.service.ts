import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma } from "@verevia/database";
import { AuthorizationService } from "../../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../../authorization/person-role-assignments.service";
import { CreateTournamentVenueDto } from "./dto/create-tournament-venue.dto";

export interface TournamentVenueDto {
  id: string;
  tournamentId: string;
  venueId: string;
  venueName: string;
  displayOrder: number;
  label: string | null;
  canEdit: boolean;
}

@Injectable()
export class TournamentVenuesService {
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

  private async requireTournament(tenantId: string, tournamentId: string) {
    const db = getTenantPrisma(tenantId);
    const tournament = await db.footballTournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    return tournament;
  }

  private toDto(
    tv: { id: string; tournamentId: string; venueId: string; displayOrder: number; label: string | null; venue: { name: string } },
    canEdit: boolean,
  ): TournamentVenueDto {
    return {
      id: tv.id,
      tournamentId: tv.tournamentId,
      venueId: tv.venueId,
      venueName: tv.venue.name,
      displayOrder: tv.displayOrder,
      label: tv.label,
      canEdit,
    };
  }

  async list(tournamentId: string): Promise<TournamentVenueDto[]> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "read", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to read this tournament's venues");
    }
    const canEdit = this.authz.canOnSeason(assignments, "update", tournament.departmentId);
    const db = getTenantPrisma(context.tenantId);
    const venues = await db.tournamentVenue.findMany({
      where: { tournamentId },
      include: { venue: { select: { name: true } } },
      orderBy: { displayOrder: "asc" },
    });
    return venues.map((v) => this.toDto(v, canEdit));
  }

  async create(tournamentId: string, dto: CreateTournamentVenueDto): Promise<TournamentVenueDto> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to add venues to this tournament");
    }

    const db = getTenantPrisma(context.tenantId);
    const venue = await db.venue.findUnique({ where: { id: dto.venueId } });
    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    try {
      const tv = await db.tournamentVenue.create({
        data: {
          tenantId: context.tenantId,
          tournamentId,
          venueId: dto.venueId,
          displayOrder: dto.displayOrder ?? 0,
          label: dto.label,
        },
        include: { venue: { select: { name: true } } },
      });
      return this.toDto(tv, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This venue is already assigned to this tournament");
      }
      throw error;
    }
  }

  async remove(tournamentId: string, venueId: string): Promise<void> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.tournamentVenue.findFirst({ where: { tournamentId, venueId } });
    if (!existing) {
      throw new NotFoundException("Tournament venue not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to remove this tournament's venues");
    }

    // Application-layer guardrail (documented in ADR 0008): a venue may
    // not be removed from a tournament's venue set while a match of that
    // tournament still uses it — not expressible as a DB CHECK (would
    // need to reference two other tables), so checked here explicitly.
    const referencingMatch = await db.footballMatch.findFirst({
      where: { tournamentId, venueId },
    });
    if (referencingMatch) {
      throw new ConflictException("This venue is still used by a match in this tournament");
    }

    await db.tournamentVenue.delete({ where: { id: existing.id } });
  }
}
