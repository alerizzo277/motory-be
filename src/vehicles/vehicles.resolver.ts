import { Inject, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { authValidationPipe } from '../common/graphql-errors.js';
import { CreateVehicleInput, UpdateVehicleInput } from './dto/vehicle.input.js';
import { Vehicle } from './models/vehicle.model.js';
import { VehiclesService } from './vehicles.service.js';
@Resolver(() => Vehicle)
@UseGuards(GqlAuthGuard)
@UsePipes(authValidationPipe())
export class VehiclesResolver {
  constructor(@Inject(VehiclesService) private readonly vehiclesService: VehiclesService) {}
  @Query(() => [Vehicle])
  vehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.list(user.id);
  }
  @Query(() => Vehicle)
  vehicle(@CurrentUser() user: AuthenticatedUser, @Args('id', { type: () => ID }) id: string) {
    return this.vehiclesService.get(user.id, id);
  }
  @Mutation(() => Vehicle)
  createVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input', { type: () => CreateVehicleInput }) input: CreateVehicleInput,
  ) {
    return this.vehiclesService.create(user.id, input);
  }
  @Mutation(() => Vehicle)
  updateVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateVehicleInput }) input: UpdateVehicleInput,
  ) {
    return this.vehiclesService.update(user.id, id, input);
  }
}
