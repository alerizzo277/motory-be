import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { ValidationPipe } from '@nestjs/common';

export type ErrorCode =
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'USER_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_SERVER_ERROR';
export function applicationError(
  code: ErrorCode,
  message: string,
): GraphQLError {
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
  'EMAIL_ALREADY_EXISTS',
  'INVALID_CREDENTIALS',
  'UNAUTHENTICATED',
  'USER_NOT_FOUND',
  'VALIDATION_ERROR',
]);
export function formatGraphqlError(
  error: GraphQLFormattedError,
): GraphQLFormattedError {
  const code =
    typeof error.extensions?.code === 'string'
      ? error.extensions.code
      : 'INTERNAL_SERVER_ERROR';
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
  if (
    [
      'GRAPHQL_PARSE_FAILED',
      'GRAPHQL_VALIDATION_FAILED',
      'BAD_USER_INPUT',
    ].includes(code)
  ) {
    return {
      message: 'Invalid GraphQL request.',
      extensions: { code: 'VALIDATION_ERROR' },
    };
  }
  return {
    message: 'An unexpected error occurred.',
    path: error.path,
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
}
