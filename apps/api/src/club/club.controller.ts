import { Body, Controller, Get, Patch, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { ClubService } from "./club.service";
import { UpdateClubDto } from "./dto/update-club.dto";

@Controller({ path: "club", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class ClubController {
  constructor(private readonly clubService: ClubService) {}

  @Get()
  getClub() {
    return this.clubService.getClub();
  }

  @Patch()
  updateClub(@Body() dto: UpdateClubDto) {
    return this.clubService.updateClub(dto);
  }
}
