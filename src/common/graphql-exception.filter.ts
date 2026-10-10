import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Let Apollo's formatter own GraphQL diagnostics; Nest's default handler logs raw errors.
@Catch()
export class GraphqlExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType<string>() === 'graphql') return exception;
    super.catch(exception, host);
  }
}
