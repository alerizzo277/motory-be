import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

// Recovery listings intentionally expose neither mileage nor maintenance relationships.
@ObjectType('DeletedVehicle')
export class DeletedVehicle {
  @Field(() => ID) id: string;
  @Field(() => String) brand: string;
  @Field(() => String) model: string;
  @Field(() => Int) year: number;
  @Field(() => String) licensePlate: string;
  @Field(() => Date) deletedAt: Date;
  @Field(() => Date) recoveryDeadline: Date;
}
