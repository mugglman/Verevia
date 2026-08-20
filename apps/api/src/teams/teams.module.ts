import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { TeamMembersController } from "./team-members.controller";
import { TeamMembersService } from "./team-members.service";
import { TeamsController } from "./teams.controller";
import { TeamsService } from "./teams.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [TeamsController, TeamMembersController],
  providers: [TeamsService, TeamMembersService],
})
export class TeamsModule {}
