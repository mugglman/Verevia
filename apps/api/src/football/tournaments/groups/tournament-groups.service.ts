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
import { computeGroupStandings, type GroupMatchResult, type GroupStandingsRow } from "../schedule/generator/group-standings";
import { CreateTournamentGroupDto } from "./dto/create-tournament-group.dto";
import { UpdateTournamentGroupDto } from "./dto/update-tournament-group.dto";

export interface TournamentGroupDto {
  id: string;
  tournamentId: string;
  name: string;
  displayOrder: number;
  canEdit: boolean;
  // Phase 16: always DERIVED live from match data, never persisted (ADR
  // 0012) — empty until the group has at least one participant, all-zero
  // rows once participants exist but no match is completed yet, and a
  // genuine sporting tie is reflected via tiedRankGroupSize rather than
  // silently guessed (see GroupStandingsRow's own doc comment).
  standings: GroupStandingsRow[];
  // True once every one of the group's matches is COMPLETED — the table
  // above is a final result rather than an interim standing. A group with
  // zero matches yet (not committed) is never "complete".
  isComplete: boolean;
}

@Injectable()
export class TournamentGroupsService {
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
    group: { id: string; tournamentId: string; name: string; displayOrder: number },
    canEdit: boolean,
    standings: GroupStandingsRow[] = [],
    isComplete = false,
  ): TournamentGroupDto {
    return { id: group.id, tournamentId: group.tournamentId, name: group.name, displayOrder: group.displayOrder, canEdit, standings, isComplete };
  }

  async list(tournamentId: string): Promise<TournamentGroupDto[]> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "read", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to read this tournament's groups");
    }
    const canEdit = this.authz.canOnSeason(assignments, "update", tournament.departmentId);
    const db = getTenantPrisma(context.tenantId);
    const groups = await db.tournamentGroup.findMany({
      where: { tournamentId },
      orderBy: { displayOrder: "asc" },
    });

    // Two tournament-wide queries instead of one per group — standings are
    // always derived live (ADR 0012), never persisted.
    const participants = await db.tournamentParticipant.findMany({
      where: { tournamentId, status: "ACTIVE", groupId: { not: null } },
      select: { id: true, groupId: true },
    });
    const groupMatches = await db.footballMatch.findMany({
      where: { tournamentId, tournamentGroupId: { not: null } },
      select: { tournamentGroupId: true, status: true, homeParticipantId: true, awayParticipantId: true, homeScore: true, awayScore: true },
    });

    return groups.map((g) => {
      const participantIds = participants.filter((p) => p.groupId === g.id).map((p) => p.id);
      const matchesForGroup = groupMatches.filter((m) => m.tournamentGroupId === g.id);
      const isComplete = matchesForGroup.length > 0 && matchesForGroup.every((m) => m.status === "COMPLETED");
      const completedResults: GroupMatchResult[] = matchesForGroup
        .filter((m) => m.status === "COMPLETED" && m.homeParticipantId && m.awayParticipantId && m.homeScore != null && m.awayScore != null)
        .map((m) => ({
          homeParticipantId: m.homeParticipantId!,
          awayParticipantId: m.awayParticipantId!,
          homeScore: m.homeScore!,
          awayScore: m.awayScore!,
        }));
      const standings = computeGroupStandings(participantIds, completedResults);
      return this.toDto(g, canEdit, standings, isComplete);
    });
  }

  async create(tournamentId: string, dto: CreateTournamentGroupDto): Promise<TournamentGroupDto> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to add groups to this tournament");
    }

    const db = getTenantPrisma(context.tenantId);
    try {
      const group = await db.tournamentGroup.create({
        data: {
          tenantId: context.tenantId,
          tournamentId,
          name: dto.name,
          displayOrder: dto.displayOrder ?? 0,
        },
      });
      return this.toDto(group, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A group with this name already exists in this tournament");
      }
      throw error;
    }
  }

  async update(tournamentId: string, groupId: string, dto: UpdateTournamentGroupDto): Promise<TournamentGroupDto> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.tournamentGroup.findUnique({ where: { id: groupId } });
    if (!existing || existing.tournamentId !== tournamentId) {
      throw new NotFoundException("Tournament group not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to update this tournament's groups");
    }

    try {
      const group = await db.tournamentGroup.update({
        where: { id: groupId },
        data: { name: dto.name, displayOrder: dto.displayOrder },
      });
      return this.toDto(group, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A group with this name already exists in this tournament");
      }
      throw error;
    }
  }
}
