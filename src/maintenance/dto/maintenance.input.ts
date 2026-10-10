import { Field, ID, InputType, Int, PartialType, OmitType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { Allow, ValidateNested, IsOptional } from 'class-validator';
import { MaintenanceStatus } from '../maintenance-status.js';

@InputType()
export class NextScheduledEventInput {
  @Field(() => String) @Allow() name: string;
  @Field(() => ID) @Allow() categoryId: string;
  @Field(() => String, { nullable: true, description: 'Calendar date in YYYY-MM-DD format.' })
  @Allow()
  scheduledDate?: string | null;
  @Field(() => Int, { nullable: true }) @Allow() scheduledOdometerKm?: number | null;
  @Field(() => String, { nullable: true }) @Allow() notes?: string | null;
}

@InputType()
export class CreateMaintenanceEventInput extends NextScheduledEventInput {
  @Field(() => ID) @Allow() vehicleId: string;
  @Field(() => MaintenanceStatus) @Allow() status: MaintenanceStatus;
  @Field(() => String, { nullable: true, description: 'Calendar date in YYYY-MM-DD format.' })
  @Allow()
  executionDate?: string | null;
  @Field(() => Int, { nullable: true }) @Allow() odometerKm?: number | null;
  @Field(() => String, {
    nullable: true,
    description: 'Non-negative decimal amount, up to 10 integer digits and 2 decimal places.',
  })
  @Allow()
  cost?: string | null;
  @Field(() => String, { nullable: true }) @Allow() provider?: string | null;
  @Field(() => NextScheduledEventInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => NextScheduledEventInput)
  nextScheduledEvent?: NextScheduledEventInput | null;
}

@InputType()
export class UpdateMaintenanceEventInput extends PartialType(
  OmitType(CreateMaintenanceEventInput, ['vehicleId'] as const),
  { skipNullProperties: false },
) {}
