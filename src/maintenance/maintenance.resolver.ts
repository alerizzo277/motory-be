import { Inject, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { authValidationPipe } from '../common/graphql-errors.js';
import {
  CreateMaintenanceEventInput,
  UpdateMaintenanceEventInput,
} from './dto/maintenance.input.js';
import { Category, MaintenanceEvent, MaintenanceEventPayload } from './models/maintenance.model.js';
import { MaintenanceStatus } from './maintenance-status.js';
import { MaintenanceService } from './maintenance.service.js';

@Resolver(() => MaintenanceEvent)
@UseGuards(GqlAuthGuard)
@UsePipes(authValidationPipe())
export class MaintenanceResolver {
  constructor(@Inject(MaintenanceService) private readonly service: MaintenanceService) {}
  @Query(() => [Category]) categories() {
    return this.service.categories();
  }
  @Query(() => [MaintenanceEvent])
  maintenanceEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Args('vehicleId', { type: () => ID }) vehicleId: string,
    @Args('status', { type: () => MaintenanceStatus, nullable: true })
    status?: MaintenanceStatus | null,
  ) {
    return this.service.list(user.id, vehicleId, status);
  }
  @Query(() => MaintenanceEvent)
  maintenanceEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.get(user.id, id);
  }
  @Mutation(() => MaintenanceEventPayload)
  createMaintenanceEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input', { type: () => CreateMaintenanceEventInput }) input: CreateMaintenanceEventInput,
  ) {
    return this.service.create(user.id, input);
  }
  @Mutation(() => MaintenanceEventPayload)
  updateMaintenanceEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateMaintenanceEventInput }) input: UpdateMaintenanceEventInput,
  ) {
    return this.service.update(user.id, id, input);
  }
}
