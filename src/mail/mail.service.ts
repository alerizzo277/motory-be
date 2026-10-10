import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { vehicleDeletionEmail } from './templates/vehicle-deletion-email.js';
import type { DeletedVehicleInformation } from './templates/vehicle-deletion-email.js';
import { actionEmail } from './templates/action-email.js';
import { passwordChangedEmail } from './templates/password-changed-email.js';
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

  sendVerificationEmail(to: string, url: string, minutes: number) {
    return this.sendEmail({
      to,
      subject: 'Conferma il tuo indirizzo email — Motory',
      html: actionEmail(
        'Conferma il tuo indirizzo email',
        'Per completare la registrazione a Motory, conferma il tuo indirizzo email.',
        'Verifica email',
        url,
        minutes,
      ),
    });
  }
  sendPasswordResetEmail(to: string, url: string, minutes: number) {
    return this.sendEmail({
      to,
      subject: 'Reimposta la password — Motory',
      html: actionEmail(
        'Reimposta la password',
        'Hai richiesto di modificare la password del tuo account Motory.',
        'Reimposta password',
        url,
        minutes,
        true,
      ),
    });
  }
  sendPasswordChangedEmail(to: string) {
    return this.sendEmail({
      to,
      subject: 'Motory - Password modificata',
      html: passwordChangedEmail(),
    });
  }
  sendVehicleDeletionEmail(to: string, vehicle: DeletedVehicleInformation, retentionDays: number) {
    return this.sendEmail({
      to,
      subject: 'Motory - Veicolo rimosso dal tuo garage',
      html: vehicleDeletionEmail(vehicle, retentionDays),
    });
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
