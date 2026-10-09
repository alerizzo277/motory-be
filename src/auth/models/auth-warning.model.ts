import { Field, ObjectType } from '@nestjs/graphql';

export const VERIFICATION_EMAIL_SEND_FAILED = 'VERIFICATION_EMAIL_SEND_FAILED';

@ObjectType()
export class AuthWarning {
  @Field(() => String) code: string;
}

@ObjectType()
export class AuthWarningsPayload {
  @Field(() => [AuthWarning]) warnings: AuthWarning[];
}
