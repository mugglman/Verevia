import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { ClubController } from "./club.controller";
import { ClubService } from "./club.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [ClubController],
  providers: [ClubService],
})
export class ClubModule {}
