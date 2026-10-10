import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from '../../users/users.service.js';
@InputType()
export class LoginInput {
  @Field(() => String)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @Field(() => String)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
@InputType()
export class RegisterInput {
  @Field(() => String)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @Field(() => String)
  @IsString()
  @Length(8, 128)
  password: string;
  @Field(() => String)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  firstName: string;
  @Field(() => String)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  lastName: string;
}

@InputType()
export class EmailInput {
  @Field(() => String)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
}
@InputType()
export class ResetPasswordInput {
  @Field(() => String)
  @IsString()
  @Length(1, 256)
  token: string;
  @Field(() => String)
  @IsString()
  @Length(8, 128)
  newPassword: string;
}
