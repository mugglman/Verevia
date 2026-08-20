import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { PersonsController } from "./persons.controller";
import { PersonsService } from "./persons.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [PersonsController],
  providers: [PersonsService],
})
export class PersonsModule {}
