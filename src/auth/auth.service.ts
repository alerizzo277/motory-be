import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash, verify } from 'argon2';
import { UsersService, publicUser } from '../users/users.service.js';
import { applicationError } from '../common/graphql-errors.js';
import type { LoginInput, RegisterInput } from './dto/auth.input.js';
@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}
  async register(input: RegisterInput) {
    if (await this.users.findByEmail(input.email)) {
      throw applicationError(
        'EMAIL_ALREADY_EXISTS',
        'An account with this email already exists.',
      );
    }
    const passwordHash = await hash(input.password, { type: argon2id });
    return publicUser(
      await this.users.create({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
      }),
    );
  }
  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);
    if (!user || !(await verify(user.passwordHash, input.password))) {
      throw applicationError(
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
      );
    }
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        role: user.role.name,
      }),
      user: publicUser(user),
    };
  }
  async me(id: string) {
    const user = await this.users.findById(id);
    if (!user)
      throw applicationError(
        'USER_NOT_FOUND',
        'The authenticated user no longer exists.',
      );
    return publicUser(user);
  }
}
