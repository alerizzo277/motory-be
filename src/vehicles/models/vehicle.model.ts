import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
@ObjectType('Vehicle')
export class Vehicle {
  @Field(() => ID) id: string;
  @Field(() => String) brand: string;
  @Field(() => String) model: string;
  @Field(() => Int) year: number;
  @Field(() => String) licensePlate: string;
  @Field(() => String, { nullable: true }) fuelType: string | null;
  @Field(() => Date) createdAt: Date;
  @Field(() => Date) updatedAt: Date;
  @Field(() => Int, { nullable: true }) latestOdometerKm: number | null;
}
