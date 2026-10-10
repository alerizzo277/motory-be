import { loggerOptions } from './logger-config.js';

describe('logger configuration', () => {
  it('defaults to human-readable development logging through log', () => {
    expect(loggerOptions({})).toEqual({
      json: false,
      logLevels: ['fatal', 'error', 'warn', 'log'],
    });
  });
  it('defaults production to JSON through warn', () => {
    expect(loggerOptions({ NODE_ENV: 'production' })).toEqual({
      json: true,
      logLevels: ['fatal', 'error', 'warn'],
    });
  });
  it('disables tests unless explicitly enabled', () => {
    expect(loggerOptions({ NODE_ENV: 'test' }).logLevels).toEqual([]);
    expect(loggerOptions({ NODE_ENV: 'test', LOG_LEVEL: 'error' }).logLevels).toEqual([
      'fatal',
      'error',
    ]);
  });
  it.each(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])(
    'accepts threshold %s',
    (LOG_LEVEL) => {
      const levels = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
      expect(loggerOptions({ LOG_LEVEL }).logLevels).toEqual(
        levels.slice(0, levels.indexOf(LOG_LEVEL) + 1),
      );
    },
  );
  it.each(['', 'trace', 'WARN', 'warn,error'])('rejects invalid level %s', (LOG_LEVEL) => {
    expect(() => loggerOptions({ LOG_LEVEL })).toThrow('Invalid LOG_LEVEL');
  });
  it('rejects unsupported environments', () => {
    expect(() => loggerOptions({ NODE_ENV: 'staging' })).toThrow('Invalid NODE_ENV');
  });
});
