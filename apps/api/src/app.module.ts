import { Module } from "@nestjs/common";
import { ClubModule } from "./club/club.module";
import { DepartmentsModule } from "./departments/departments.module";
import { EventsModule } from "./events/events.module";
import { FootballModule } from "./football/football.module";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { PersonsModule } from "./persons/persons.module";
import { RelationshipsModule } from "./relationships/relationships.module";
import { SeasonsModule } from "./seasons/seasons.module";
import { TeamsModule } from "./teams/teams.module";
import { VenuesModule } from "./venues/venues.module";

@Module({
  imports: [
    HealthModule,
    ClubModule,
    DepartmentsModule,
    TeamsModule,
    PersonsModule,
    RelationshipsModule,
    InvitationsModule,
    SeasonsModule,
    FootballModule,
    VenuesModule,
    EventsModule,
  ],
})
export class AppModule {}
