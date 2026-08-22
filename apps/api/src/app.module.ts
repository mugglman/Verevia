import { Module } from "@nestjs/common";
import { ClubModule } from "./club/club.module";
import { DepartmentsModule } from "./departments/departments.module";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { PersonsModule } from "./persons/persons.module";
import { RelationshipsModule } from "./relationships/relationships.module";
import { TeamsModule } from "./teams/teams.module";

@Module({
  imports: [
    HealthModule,
    ClubModule,
    DepartmentsModule,
    TeamsModule,
    PersonsModule,
    RelationshipsModule,
    InvitationsModule,
  ],
})
export class AppModule {}
