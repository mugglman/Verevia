import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { EventsModule } from "../events/events.module";
import { AttendancesController } from "./attendances.controller";
import { AttendancesService } from "./attendances.service";

@Module({
  imports: [AuthorizationModule, EventsModule],
  controllers: [AttendancesController],
  providers: [AttendancesService],
})
export class AttendancesModule {}
