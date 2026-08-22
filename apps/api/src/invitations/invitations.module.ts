import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { MailModule } from "../mail/mail.module";
import { InvitationsService } from "./invitations.service";
import { PersonInvitationsController } from "./person-invitations.controller";
import { PublicInvitationsController } from "./public-invitations.controller";

@Module({
  imports: [AuthorizationModule, MailModule],
  controllers: [PersonInvitationsController, PublicInvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
