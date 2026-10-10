import { type ConsoleLoggerOptions, type LogLevel } from '@nestjs/common';

const levels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

export function loggerOptions(env: NodeJS.ProcessEnv = process.env): ConsoleLoggerOptions {
  const environment = env.NODE_ENV ?? 'development';
  if (!['development', 'production', 'test'].includes(environment)) {
    throw new Error('Invalid NODE_ENV: expected development, production or test');
  }
  const level = env.LOG_LEVEL ?? (environment === 'production' ? 'warn' : 'log');
  if (!levels.includes(level as LogLevel)) {
    throw new Error('Invalid LOG_LEVEL: expected fatal, error, warn, log, debug or verbose');
  }
  return {
    json: environment === 'production',
    logLevels:
      environment === 'test' && env.LOG_LEVEL === undefined
        ? []
        : levels.slice(0, levels.indexOf(level as LogLevel) + 1),
  };
}
