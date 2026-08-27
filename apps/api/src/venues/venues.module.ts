import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { VenuesController } from "./venues.controller";
import { VenuesService } from "./venues.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [VenuesController],
  providers: [VenuesService],
})
export class VenuesModule {}
