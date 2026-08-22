import { Injectable, Logger } from "@nestjs/common";
import type { MailMessage, MailProvider } from "../mail.interface";

/**
 * Development-only provider (Phase 6, section 12): no real credentials
 * exist yet, so this is the entire "delivery" mechanism in dev/CI/VPS
 * verification — it logs the message so a developer/tester can read the
 * invitation link. Never used once a real provider is configured for a
 * non-development environment; swapping providers is a MailModule change,
 * nothing that calls MailService needs to know.
 */
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger("Mail (dev)");

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`An: ${message.to} — Betreff: ${message.subject}\n${message.text}`);
  }
}
