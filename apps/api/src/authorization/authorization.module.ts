import { Module } from "@nestjs/common";
import { AuthorizationService } from "./authorization.service";
import { PersonRoleAssignmentsService } from "./person-role-assignments.service";

@Module({
  providers: [AuthorizationService, PersonRoleAssignmentsService],
  exports: [AuthorizationService, PersonRoleAssignmentsService],
})
export class AuthorizationModule {}
