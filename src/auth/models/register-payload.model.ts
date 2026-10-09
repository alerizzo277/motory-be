import { Field, ObjectType } from '@nestjs/graphql';
import { User } from '../../users/models/user.model.js';
import { AuthWarning } from './auth-warning.model.js';

@ObjectType()
export class RegisterPayload {
  @Field(() => User) user: User;
  @Field(() => [AuthWarning]) warnings: AuthWarning[];
}
