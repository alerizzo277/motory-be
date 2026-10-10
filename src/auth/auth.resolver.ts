import { Inject, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service.js';
import {
  ChangePasswordInput,
  EmailInput,
  ResetPasswordInput,
  LoginInput,
  RegisterInput,
} from './dto/auth.input.js';
import { RegisterPayload } from './models/register-payload.model.js';
import { AuthWarningsPayload } from './models/auth-warning.model.js';
import { AuthPayload } from './models/auth-payload.model.js';
import { User } from '../users/models/user.model.js';
import { GqlAuthGuard } from './guards/gql-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './auth.types.js';
import { authValidationPipe } from '../common/graphql-errors.js';
import { UsersService } from '../users/users.service.js';
import { UpdateProfileInput } from '../users/dto/update-profile.input.js';
@Resolver()
@UsePipes(authValidationPipe())
export class AuthResolver {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}
  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input', { type: () => UpdateProfileInput }) input: UpdateProfileInput,
  ) {
    return this.users.updateProfile(user.id, input);
  }
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input', { type: () => ChangePasswordInput }) input: ChangePasswordInput,
  ) {
    return this.auth.changePassword(user.id, input.currentPassword, input.newPassword);
  }
  @Mutation(() => RegisterPayload)
  register(@Args('input', { type: () => RegisterInput }) input: RegisterInput) {
    return this.auth.register(input);
  }
  @Mutation(() => AuthPayload)
  login(@Args('input', { type: () => LoginInput }) input: LoginInput) {
    return this.auth.login(input);
  }
  @Mutation(() => Boolean)
  verifyEmail(@Args('token', { type: () => String }) token: string) {
    return this.auth.verifyEmail(token);
  }
  @Mutation(() => AuthWarningsPayload)
  resendVerificationEmail(@Args('input', { type: () => EmailInput }) input: EmailInput) {
    return this.auth.resendVerificationEmail(input.email);
  }
  @Mutation(() => Boolean)
  forgotPassword(@Args('input', { type: () => EmailInput }) input: EmailInput) {
    return this.auth.forgotPassword(input.email);
  }
  @Mutation(() => Boolean)
  resetPassword(
    @Args('input', { type: () => ResetPasswordInput })
    input: ResetPasswordInput,
  ) {
    return this.auth.resetPassword(input.token, input.newPassword);
  }
  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
