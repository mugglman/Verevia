import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { AttendancesService } from "./attendances.service";
import { MarkAttendedDto } from "./dto/mark-attended.dto";
import { SetRsvpDto } from "./dto/set-rsvp.dto";

@Controller({ path: "events/:eventId/attendances", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  @Get()
  list(@Param("eventId", ParseUUIDPipe) eventId: string) {
    return this.attendancesService.list(eventId);
  }

  @Put(":personId/rsvp")
  setRsvp(
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("personId", ParseUUIDPipe) personId: string,
    @Body() dto: SetRsvpDto,
  ) {
    return this.attendancesService.setRsvp(eventId, personId, dto);
  }

  @Put(":personId/attended")
  markAttended(
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("personId", ParseUUIDPipe) personId: string,
    @Body() dto: MarkAttendedDto,
  ) {
    return this.attendancesService.markAttended(eventId, personId, dto);
  }
}
