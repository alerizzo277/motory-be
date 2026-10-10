import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

@ArgsType()
export class AdminUsersArgs {
  @Field(() => Int, { defaultValue: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page: number = 1;

  @Field(() => Int, { defaultValue: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  search?: string | null;
}
