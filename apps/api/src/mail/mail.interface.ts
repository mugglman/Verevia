export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text body — kept simple deliberately (no HTML templates yet). */
  text: string;
}

/**
 * Provider abstraction so no concrete mail vendor is wired into domain
 * logic (Phase 6, section 12). Exactly one implementation exists so far
 * (`ConsoleMailProvider`, development-only, see mail.module.ts) —
 * swapping in a real provider (Resend/SMTP) later means adding one class
 * implementing this interface and rebinding the `MAIL_PROVIDER` token, no
 * change anywhere that calls `MailService`.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol("MAIL_PROVIDER");
