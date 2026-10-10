import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { AuthContext } from '../auth/auth.types.js';
import { applicationError } from '../common/graphql-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = GqlExecutionContext.create(context).getContext<AuthContext>().req.user;
    if (!user) throw applicationError('UNAUTHENTICATED', 'Authentication required.');
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { role: { select: { name: true } } },
    });
    if (!account) throw applicationError('UNAUTHENTICATED', 'Authentication required.');
    if (account.role.name !== 'ADMIN')
      throw applicationError('FORBIDDEN', 'Administrator access required.');
    return true;
  }
}
