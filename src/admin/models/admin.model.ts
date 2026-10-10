import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AdminUserSummary {
  @Field(() => ID) id: string;
  @Field(() => String) firstName: string;
  @Field(() => String) lastName: string;
  @Field(() => String) email: string;
  @Field(() => Date) createdAt: Date;
  @Field(() => Boolean) emailVerified: boolean;
  @Field(() => [String]) roles: string[];
}

@ObjectType()
export class AdminUserActivity {
  @Field(() => Int) activeVehiclesCount: number;
  @Field(() => Int) deletedVehiclesCount: number;
  @Field(() => Int) totalMaintenanceEventsCount: number;
}

@ObjectType()
export class AdminUserDetail extends AdminUserSummary {
  @Field(() => AdminUserActivity) activity: AdminUserActivity;
}

@ObjectType()
export class AdminUsersPage {
  @Field(() => [AdminUserSummary]) items: AdminUserSummary[];
  @Field(() => Int) totalCount: number;
  @Field(() => Int) page: number;
  @Field(() => Int) pageSize: number;
  @Field(() => Int) totalPages: number;
}

@ObjectType()
export class AdminDashboard {
  @Field(() => Int) totalUsers: number;
  @Field(() => Int) verifiedUsers: number;
  @Field(() => Int) activeVehicles: number;
  @Field(() => Int) deletedVehicles: number;
  @Field(() => Int) totalMaintenanceEvents: number;
  @Field(() => [AdminUserSummary]) recentUsers: AdminUserSummary[];
}
