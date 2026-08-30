import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AgeGroupsController } from "./age-groups/age-groups.controller";
import { AgeGroupsService } from "./age-groups/age-groups.service";
import { MatchesController } from "./matches/matches.controller";
import { MatchesService } from "./matches/matches.service";
import { TeamSeasonsController } from "./team-seasons/team-seasons.controller";
import { TeamSeasonsService } from "./team-seasons/team-seasons.service";
import { ParticipantsController } from "./tournaments/participants/participants.controller";
import { ParticipantsService } from "./tournaments/participants/participants.service";
import { TournamentGroupsController } from "./tournaments/groups/tournament-groups.controller";
import { TournamentGroupsService } from "./tournaments/groups/tournament-groups.service";
import { TournamentMatchesController } from "./tournaments/matches/tournament-matches.controller";
import { TournamentKnockoutController } from "./tournaments/schedule/tournament-knockout.controller";
import { TournamentKnockoutService } from "./tournaments/schedule/tournament-knockout.service";
import { TournamentScheduleController } from "./tournaments/schedule/tournament-schedule.controller";
import { TournamentScheduleService } from "./tournaments/schedule/tournament-schedule.service";
import { TournamentVenuesController } from "./tournaments/venues/tournament-venues.controller";
import { TournamentVenuesService } from "./tournaments/venues/tournament-venues.service";
import { TournamentsController } from "./tournaments/tournaments.controller";
import { TournamentsService } from "./tournaments/tournaments.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [
    AgeGroupsController,
    TeamSeasonsController,
    MatchesController,
    TournamentsController,
    ParticipantsController,
    TournamentVenuesController,
    TournamentGroupsController,
    TournamentMatchesController,
    TournamentScheduleController,
    TournamentKnockoutController,
  ],
  providers: [
    AgeGroupsService,
    TeamSeasonsService,
    MatchesService,
    TournamentsService,
    ParticipantsService,
    TournamentVenuesService,
    TournamentGroupsService,
    TournamentScheduleService,
    TournamentKnockoutService,
  ],
})
export class FootballModule {}
