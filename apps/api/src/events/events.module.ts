import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
