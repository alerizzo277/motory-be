import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { AuthContext, AuthenticatedUser } from '../auth.types.js';
import { applicationError } from '../../common/graphql-errors.js';
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = GqlExecutionContext.create(context).getContext<AuthContext>().req.user;
    if (!user) throw applicationError('UNAUTHENTICATED', 'Authentication required.');
    return user;
  },
);
