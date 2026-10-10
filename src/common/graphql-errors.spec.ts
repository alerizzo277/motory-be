import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import { GraphQLError } from 'graphql';
import { applicationError, formatGraphqlError } from './graphql-errors.js';
import { Prisma } from '../generated/prisma/client.js';

describe('GraphQL diagnostics', () => {
  let log: MockInstance<Logger['error']>;
  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  it.each([
    'INVALID_CREDENTIALS',
    'UNAUTHENTICATED',
    'VALIDATION_ERROR',
    'EMAIL_ALREADY_EXISTS',
    'VERIFICATION_TOKEN_INVALID',
    'PASSWORD_RESET_TOKEN_INVALID',
  ] as const)('preserves expected %s without logging', (code) => {
    const error = applicationError(code, 'Public message');
    expect(formatGraphqlError(error).message).toBe('Public message');
    expect(log).not.toHaveBeenCalled();
  });
  it.each(['GRAPHQL_PARSE_FAILED', 'GRAPHQL_VALIDATION_FAILED', 'BAD_USER_INPUT'])(
    'does not log invalid requests %s',
    (code) => {
      expect(
        formatGraphqlError(new GraphQLError('Details', { extensions: { code } })).extensions?.code,
      ).toBe('VALIDATION_ERROR');
      expect(log).not.toHaveBeenCalled();
    },
  );
  it('logs unexpected database failures once without private details', () => {
    const cause = new Prisma.PrismaClientKnownRequestError('password token email database-url', {
      code: 'P1001',
      clientVersion: 'test',
      meta: { password: 'secret' },
    });
    const error = new GraphQLError(cause.message, { originalError: cause, path: ['register'] });
    expect(formatGraphqlError(error, error)).toEqual({
      message: 'An unexpected error occurred.',
      path: ['register'],
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    expect(log).toHaveBeenCalledExactlyOnceWith({
      message: 'Unexpected GraphQL failure',
      category: 'DATABASE_FAILURE',
      databaseCode: 'P1001',
    });
  });
  it('logs intentionally mapped internal errors', () => {
    formatGraphqlError(applicationError('INTERNAL_SERVER_ERROR', 'Private details'));
    expect(log).toHaveBeenCalledTimes(1);
  });
});
