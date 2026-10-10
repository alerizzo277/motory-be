import { Injectable, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { applicationError } from '../../common/graphql-errors.js';
import type { AuthContext } from '../auth.types.js';
@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    return GqlExecutionContext.create(context).getContext<AuthContext>().req;
  }
  handleRequest<TUser>(error: unknown, user: TUser): TUser {
    if (error || !user) throw applicationError('UNAUTHENTICATED', 'Authentication required.');
    return user;
  }
}
