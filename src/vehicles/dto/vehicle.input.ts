import { Field, InputType, Int, PartialType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateBy } from 'class-validator';
import { FUEL_TYPES } from '../fuel-types.js';

@InputType()
export class CreateVehicleInput {
  @Field(() => String)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(1)
  brand: string;

  @Field(() => String)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(1)
  model: string;

  @Field(() => Int)
  @IsInt()
  @Min(1886)
  @ValidateBy({
    name: 'registrationYear',
    validator: {
      validate: (value: unknown) => typeof value === 'number' && value <= new Date().getFullYear(),
      defaultMessage: () => 'year must not be in the future',
    },
  })
  year: number;

  @Field(() => String)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(1)
  licensePlate: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: string | null;
}

@InputType()
export class UpdateVehicleInput extends PartialType(CreateVehicleInput, {
  skipNullProperties: false,
}) {}
