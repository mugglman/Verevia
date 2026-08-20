import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { TeamsController } from "./teams.controller";
import { TeamsService } from "./teams.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
