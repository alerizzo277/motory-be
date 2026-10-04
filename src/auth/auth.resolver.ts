import { Inject, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service.js';
import { LoginInput, RegisterInput } from './dto/auth.input.js';
import { AuthPayload } from './models/auth-payload.model.js';
import { User } from '../users/models/user.model.js';
import { GqlAuthGuard } from './guards/gql-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './auth.types.js';
import { authValidationPipe } from '../common/graphql-errors.js';
@Resolver()
@UsePipes(authValidationPipe())
export class AuthResolver {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Mutation(() => User)
  register(@Args('input', { type: () => RegisterInput }) input: RegisterInput) {
    return this.auth.register(input);
  }
  @Mutation(() => AuthPayload)
  login(@Args('input', { type: () => LoginInput }) input: LoginInput) {
    return this.auth.login(input);
  }
  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
