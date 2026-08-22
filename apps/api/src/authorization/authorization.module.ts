import { Module } from "@nestjs/common";
import { AuthorizationService } from "./authorization.service";
import { PersonRelationshipsAuthService } from "./person-relationships-auth.service";
import { PersonRoleAssignmentsService } from "./person-role-assignments.service";

@Module({
  providers: [AuthorizationService, PersonRoleAssignmentsService, PersonRelationshipsAuthService],
  exports: [AuthorizationService, PersonRoleAssignmentsService, PersonRelationshipsAuthService],
})
export class AuthorizationModule {}
