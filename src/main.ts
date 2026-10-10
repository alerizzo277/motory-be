import { ConsoleLogger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loggerOptions } from './common/logger-config.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  await ConfigModule.envVariablesLoaded;
  let logger: ConsoleLogger;
  try {
    logger = new ConsoleLogger(loggerOptions());
  } catch (error) {
    new ConsoleLogger({ json: process.env.NODE_ENV === 'production', logLevels: ['fatal'] }).fatal(
      error instanceof Error ? error.message : 'Invalid logging configuration',
      'Bootstrap',
    );
    process.exitCode = 1;
    return;
  }
  try {
    // Suppress Nest's raw startup exception output; the catch below emits a safe fatal entry.
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });

    app.useLogger(logger);

    app.enableCors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    });

    await app.listen(process.env.PORT ?? 3000);
  } catch {
    logger.fatal(
      'Application startup failed. Check required configuration and infrastructure.',
      'Bootstrap',
    );
    process.exitCode = 1;
  }
}

await bootstrap();
