import { Inject, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard.js';
import { authValidationPipe } from '../common/graphql-errors.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AdminUsersArgs } from './dto/admin-users.args.js';
import { AdminDashboard, AdminUserDetail, AdminUsersPage } from './models/admin.model.js';

@Resolver()
@UseGuards(GqlAuthGuard, AdminGuard)
@UsePipes(authValidationPipe())
export class AdminResolver {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}

  @Query(() => AdminDashboard)
  adminDashboard() {
    return this.service.dashboard();
  }

  @Query(() => AdminUsersPage)
  adminUsers(@Args() args: AdminUsersArgs) {
    return this.service.users(args);
  }

  @Query(() => AdminUserDetail)
  adminUser(@Args('id', { type: () => ID }) id: string) {
    return this.service.user(id);
  }
}
