import { Field, ID, ObjectType } from '@nestjs/graphql';
@ObjectType('User')
export class User {
  @Field(() => ID) id: string;
  @Field(() => String) email: string;
  @Field(() => String) firstName: string;
  @Field(() => String) lastName: string;
  @Field(() => String) role: string;
  @Field(() => Date) createdAt: Date;
  @Field(() => Date) updatedAt: Date;
}
