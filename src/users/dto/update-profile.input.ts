import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsString, Length, ValidateIf } from 'class-validator';

export function normalizeProfileName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

@InputType()
export class UpdateProfileInput {
  @Field(() => String, { nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeProfileName(value) : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @Field(() => String, { nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeProfileName(value) : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  lastName?: string;
}
