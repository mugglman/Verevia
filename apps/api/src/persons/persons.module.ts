import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { PersonRolesController } from "./person-roles.controller";
import { PersonRolesService } from "./person-roles.service";
import { PersonsController } from "./persons.controller";
import { PersonsService } from "./persons.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [PersonsController, PersonRolesController],
  providers: [PersonsService, PersonRolesService],
})
export class PersonsModule {}
