import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { SeasonsController } from "./seasons.controller";
import { SeasonsService } from "./seasons.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [SeasonsController],
  providers: [SeasonsService],
})
export class SeasonsModule {}
