import { Prisma } from '../generated/prisma/client.js';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { Logger, ValidationPipe } from '@nestjs/common';

export type ErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'VERIFICATION_TOKEN_INVALID'
  | 'PASSWORD_RESET_TOKEN_INVALID'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_CURRENT_PASSWORD'
  | 'PASSWORD_UNCHANGED'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'MAINTENANCE_EVENT_NOT_FOUND'
  | 'VEHICLE_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_SERVER_ERROR';
export function applicationError(code: ErrorCode, message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
export function authValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new GraphQLError('Invalid input.', {
        extensions: {
          code: 'VALIDATION_ERROR',
          fields: errors.map(({ property, constraints }) => ({
            field: property,
            messages: Object.values(constraints ?? {}),
          })),
        },
      }),
  });
}
const publicCodes = new Set([
  'EMAIL_NOT_VERIFIED',
  'VERIFICATION_TOKEN_INVALID',
  'PASSWORD_RESET_TOKEN_INVALID',
  'EMAIL_ALREADY_EXISTS',
  'INVALID_CREDENTIALS',
  'INVALID_CURRENT_PASSWORD',
  'PASSWORD_UNCHANGED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'USER_NOT_FOUND',
  'VEHICLE_NOT_FOUND',
  'MAINTENANCE_EVENT_NOT_FOUND',
  'VALIDATION_ERROR',
]);
export function formatGraphqlError(
  error: GraphQLFormattedError,
  originalError?: unknown,
): GraphQLFormattedError {
  const code =
    typeof error.extensions?.code === 'string' ? error.extensions.code : 'INTERNAL_SERVER_ERROR';
  if (publicCodes.has(code)) {
    return {
      message: error.message,
      locations: error.locations,
      path: error.path,
      extensions: {
        code,
        ...(code === 'VALIDATION_ERROR' && error.extensions?.fields
          ? { fields: error.extensions.fields }
          : {}),
      },
    };
  }
  if (['GRAPHQL_PARSE_FAILED', 'GRAPHQL_VALIDATION_FAILED', 'BAD_USER_INPUT'].includes(code)) {
    return {
      message: 'Invalid GraphQL request.',
      extensions: { code: 'VALIDATION_ERROR' },
    };
  }
  const cause =
    originalError instanceof GraphQLError
      ? (originalError.originalError ?? originalError)
      : originalError;
  const databaseFailure =
    cause instanceof Prisma.PrismaClientKnownRequestError ||
    cause instanceof Prisma.PrismaClientUnknownRequestError ||
    cause instanceof Prisma.PrismaClientInitializationError ||
    cause instanceof Prisma.PrismaClientValidationError;
  new Logger('GraphQL').error({
    message: 'Unexpected GraphQL failure',
    category: databaseFailure ? 'DATABASE_FAILURE' : 'INTERNAL_SERVER_ERROR',
    ...(cause instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(cause.code)
      ? { databaseCode: cause.code }
      : {}),
  });
  return {
    message: 'An unexpected error occurred.',
    path: error.path,
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
}
