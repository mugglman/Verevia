import { Module } from "@nestjs/common";
import { MAIL_PROVIDER } from "./mail.interface";
import { MailService } from "./mail.service";
import { ConsoleMailProvider } from "./providers/console-mail.provider";

/**
 * Only a console/dev provider is wired up for now (Phase 6, section 12 —
 * no real Resend/SMTP credentials exist yet, and this work order
 * explicitly does not require forcing a production mail setup). Swapping
 * to a real provider later is a one-line change here (rebind
 * MAIL_PROVIDER to the new class); no other module needs to change.
 */
@Module({
  providers: [
    ConsoleMailProvider,
    { provide: MAIL_PROVIDER, useExisting: ConsoleMailProvider },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
