import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma, ParticipantStatus } from "@verevia/database";
import { AuthorizationService } from "../../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../../authorization/person-role-assignments.service";
import { CreateParticipantDto } from "./dto/create-participant.dto";
import { UpdateParticipantDto } from "./dto/update-participant.dto";

export interface ParticipantDto {
  id: string;
  tournamentId: string;
  teamSeasonId: string | null;
  teamName: string | null;
  ageGroupName: string | null;
  externalName: string | null;
  groupId: string | null;
  groupName: string | null;
  status: ParticipantStatus;
  seed: number | null;
  canEdit: boolean;
}

const PARTICIPANT_INCLUDE = {
  teamSeason: { select: { team: { select: { name: true } }, ageGroup: { select: { name: true } } } },
  group: { select: { name: true } },
} as const;

type ParticipantWithRelations = {
  id: string;
  tournamentId: string;
  teamSeasonId: string | null;
  externalName: string | null;
  groupId: string | null;
  status: ParticipantStatus;
  seed: number | null;
  teamSeason: { team: { name: string }; ageGroup: { name: string } } | null;
  group: { name: string } | null;
};

@Injectable()
export class ParticipantsService {
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

  private toDto(participant: ParticipantWithRelations, canEdit: boolean): ParticipantDto {
    return {
      id: participant.id,
      tournamentId: participant.tournamentId,
      teamSeasonId: participant.teamSeasonId,
      teamName: participant.teamSeason?.team.name ?? null,
      ageGroupName: participant.teamSeason?.ageGroup.name ?? null,
      externalName: participant.externalName,
      groupId: participant.groupId,
      groupName: participant.group?.name ?? null,
      status: participant.status,
      seed: participant.seed,
      canEdit,
    };
  }

  private async requireTournament(tenantId: string, tournamentId: string) {
    const db = getTenantPrisma(tenantId);
    const tournament = await db.footballTournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    return tournament;
  }

  async list(tournamentId: string): Promise<ParticipantDto[]> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "read", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to read this tournament's participants");
    }
    const canEdit = this.authz.canOnSeason(assignments, "update", tournament.departmentId);
    const db = getTenantPrisma(context.tenantId);
    const participants = await db.tournamentParticipant.findMany({
      where: { tournamentId },
      include: PARTICIPANT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return participants.map((p) => this.toDto(p, canEdit));
  }

  async create(tournamentId: string, dto: CreateParticipantDto): Promise<ParticipantDto> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to add participants to this tournament");
    }

    const hasInternal = Boolean(dto.teamSeasonId);
    const hasExternal = Boolean(dto.externalName);
    if (hasInternal === hasExternal) {
      throw new BadRequestException("Provide exactly one of teamSeasonId or externalName");
    }

    const db = getTenantPrisma(context.tenantId);

    if (dto.teamSeasonId) {
      const teamSeason = await db.teamSeason.findUnique({ where: { id: dto.teamSeasonId } });
      if (!teamSeason) {
        throw new NotFoundException("Team season not found");
      }
    }

    if (dto.groupId) {
      const group = await db.tournamentGroup.findUnique({ where: { id: dto.groupId } });
      if (!group || group.tournamentId !== tournamentId) {
        throw new NotFoundException("Tournament group not found");
      }
    }

    try {
      const participant = await db.tournamentParticipant.create({
        data: {
          tenantId: context.tenantId,
          tournamentId,
          teamSeasonId: dto.teamSeasonId,
          externalName: dto.externalName,
          groupId: dto.groupId,
          seed: dto.seed,
        },
        include: PARTICIPANT_INCLUDE,
      });
      return this.toDto(participant, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          dto.teamSeasonId
            ? "This team season is already a participant in this tournament"
            : "A participant with this name already exists in this tournament",
        );
      }
      throw error;
    }
  }

  async update(tournamentId: string, participantId: string, dto: UpdateParticipantDto): Promise<ParticipantDto> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.tournamentParticipant.findUnique({ where: { id: participantId } });
    if (!existing || existing.tournamentId !== tournamentId) {
      throw new NotFoundException("Participant not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to update this tournament's participants");
    }

    if (dto.groupId) {
      const group = await db.tournamentGroup.findUnique({ where: { id: dto.groupId } });
      if (!group || group.tournamentId !== tournamentId) {
        throw new NotFoundException("Tournament group not found");
      }
    }

    const participant = await db.tournamentParticipant.update({
      where: { id: participantId },
      data: { groupId: dto.groupId, seed: dto.seed, status: dto.status },
      include: PARTICIPANT_INCLUDE,
    });
    return this.toDto(participant, true);
  }

  async remove(tournamentId: string, participantId: string): Promise<void> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.tournamentParticipant.findUnique({ where: { id: participantId } });
    if (!existing || existing.tournamentId !== tournamentId) {
      throw new NotFoundException("Participant not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to remove this tournament's participants");
    }

    try {
      await db.tournamentParticipant.delete({ where: { id: participantId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException(
          "This participant is already referenced by a match — set status to WITHDRAWN instead of removing",
        );
      }
      throw error;
    }
  }
}
