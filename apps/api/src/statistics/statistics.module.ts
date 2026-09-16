import { Module } from "@nestjs/common";
import { AttendancesModule } from "../attendances/attendances.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { EventsModule } from "../events/events.module";
import { StatisticsController } from "./statistics.controller";
import { StatisticsService } from "./statistics.service";

@Module({
  imports: [AuthorizationModule, EventsModule, AttendancesModule],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
