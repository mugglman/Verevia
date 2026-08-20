import { Module } from "@nestjs/common";
import { ClubModule } from "./club/club.module";
import { DepartmentsModule } from "./departments/departments.module";
import { HealthModule } from "./health/health.module";
import { TeamsModule } from "./teams/teams.module";

@Module({
  imports: [HealthModule, ClubModule, DepartmentsModule, TeamsModule],
})
export class AppModule {}
