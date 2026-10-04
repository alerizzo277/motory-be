import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  id: string;
}

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const apiKey = configService.getOrThrow<string>('RESEND_API_KEY').trim();
    this.from = configService.getOrThrow<string>('MAIL_FROM').trim();
    if (!apiKey || !this.from) {
      throw new Error('RESEND_API_KEY and MAIL_FROM must not be empty');
    }
    this.resend = new Resend(apiKey);
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const { data, error } = await this.resend.emails.send({
        to: options.to,
        subject: options.subject,
        html: options.html,
        from: this.from,
      });
      if (error || !data) {
        throw new BadGatewayException('Unable to send email', {
          cause: error ?? new Error('Missing email response'),
        });
      }
      return { id: data.id };
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException('Unable to send email', { cause: error });
    }
  }
}
