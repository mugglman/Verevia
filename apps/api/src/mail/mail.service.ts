import { Inject, Injectable } from "@nestjs/common";
import { MAIL_PROVIDER, type MailMessage, type MailProvider } from "./mail.interface";

@Injectable()
export class MailService {
  constructor(@Inject(MAIL_PROVIDER) private readonly provider: MailProvider) {}

  send(message: MailMessage): Promise<void> {
    return this.provider.send(message);
  }
}
