import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AgeGroupsController } from "./age-groups/age-groups.controller";
import { AgeGroupsService } from "./age-groups/age-groups.service";
import { MatchesController } from "./matches/matches.controller";
import { MatchesService } from "./matches/matches.service";
import { TeamSeasonsController } from "./team-seasons/team-seasons.controller";
import { TeamSeasonsService } from "./team-seasons/team-seasons.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [AgeGroupsController, TeamSeasonsController, MatchesController],
  providers: [AgeGroupsService, TeamSeasonsService, MatchesService],
})
export class FootballModule {}
