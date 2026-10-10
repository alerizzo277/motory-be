import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { MaintenanceStatus } from '../maintenance-status.js';

@ObjectType('Category')
export class Category {
  @Field(() => ID) id: string;
  @Field(() => String) code: string;
}

@ObjectType('MaintenanceEvent')
export class MaintenanceEvent {
  @Field(() => ID) id: string;
  @Field(() => ID) vehicleId: string;
  @Field(() => ID) categoryId: string;
  @Field(() => String) name: string;
  @Field(() => MaintenanceStatus) status: MaintenanceStatus;
  @Field(() => Date, { nullable: true }) scheduledDate: Date | null;
  @Field(() => Int, { nullable: true }) scheduledOdometerKm: number | null;
  @Field(() => Date, { nullable: true }) executionDate: Date | null;
  @Field(() => Int, { nullable: true }) odometerKm: number | null;
  @Field(() => String, { nullable: true }) cost: string | null;
  @Field(() => String, { nullable: true }) provider: string | null;
  @Field(() => String, { nullable: true }) notes: string | null;
  @Field(() => Date) createdAt: Date;
  @Field(() => Date) updatedAt: Date;
}

@ObjectType()
export class MaintenanceEventPayload {
  @Field(() => MaintenanceEvent) event: MaintenanceEvent;
  @Field(() => MaintenanceEvent, { nullable: true }) nextScheduledEvent: MaintenanceEvent | null;
}
