import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MailModule } from '../src/mail/mail.module.js';
import { MailService } from '../src/mail/mail.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MailModule],
})
class MailTestModule {}

const app = await NestFactory.createApplicationContext(MailTestModule);
try {
  const apiKey = app.get(ConfigService).getOrThrow<string>('RESEND_API_KEY');
  if (apiKey.trim() === 're_xxxxxxxxx') {
    throw new Error(
      'Sostituisci re_xxxxxxxxx nel .env con la tua vera API key Resend prima del test.',
    );
  }
  const result = await app.get(MailService).sendEmail({
    to: 'alerizzo277@gmail.com',
    subject: 'Motory - Resend test',
    html: '<p>Invio email con Resend da Motory riuscito.</p>',
  });
  console.log('Email accettata da Resend:', result.id);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : 'Invio email fallito');
  process.exitCode = 1;
} finally {
  await app.close();
}
