import { Field, ObjectType } from '@nestjs/graphql';
import { User } from '../../users/models/user.model.js';
@ObjectType()
export class AuthPayload {
  @Field(() => String) accessToken: string;
  @Field(() => User) user: User;
}
