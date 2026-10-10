import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActionTokenType } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { AuthWarning, VERIFICATION_EMAIL_SEND_FAILED } from './models/auth-warning.model.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash, verify } from 'argon2';
import { UsersService, publicUser } from '../users/users.service.js';
import { applicationError } from '../common/graphql-errors.js';
import type { LoginInput, RegisterInput } from './dto/auth.input.js';
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    const frontend = new URL(this.config.getOrThrow<string>('FRONTEND_URL'));
    if (!['http:', 'https:'].includes(frontend.protocol) || frontend.username || frontend.password)
      throw new Error('Invalid FRONTEND_URL');
    this.ttl(ActionTokenType.EMAIL_VERIFICATION);
    this.ttl(ActionTokenType.PASSWORD_RESET);
  }
  async register(input: RegisterInput) {
    if (await this.users.findByEmail(input.email)) {
      throw applicationError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
    }
    const passwordHash = await hash(input.password, { type: argon2id });
    const user = await this.users.create({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
    });
    const warnings = await this.issueToken(
      user.id,
      user.email,
      ActionTokenType.EMAIL_VERIFICATION,
      false,
    );
    return { user: publicUser(user), warnings };
  }
  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);
    if (!user || !(await verify(user.passwordHash, input.password))) {
      throw applicationError('INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    if (!user.emailVerifiedAt)
      throw applicationError('EMAIL_NOT_VERIFIED', 'Verify your email before signing in.');
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        role: user.role.name,
      }),
      user: publicUser(user),
    };
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private ttl(type: ActionTokenType) {
    const key =
      type === ActionTokenType.EMAIL_VERIFICATION
        ? 'EMAIL_VERIFICATION_TOKEN_TTL_MINUTES'
        : 'PASSWORD_RESET_TOKEN_TTL_MINUTES';
    const value = Number(
      this.config.get<string>(key, type === ActionTokenType.EMAIL_VERIFICATION ? '1440' : '60'),
    );
    if (!Number.isSafeInteger(value) || value <= 0 || value > 525600)
      throw new Error(`Invalid ${key}`);
    return value;
  }
  private async issueToken(
    userId: string,
    email: string,
    type: ActionTokenType,
    cooldown = true,
  ): Promise<AuthWarning[]> {
    const minutes = this.ttl(type);
    const token = randomBytes(32).toString('base64url');
    const issued = await this.prisma.$transaction(async (tx) => {
      // Serialize issuance and consumption for this user, including absent token rows.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || (type === ActionTokenType.EMAIL_VERIFICATION && user.emailVerifiedAt))
        return false;
      const previous = await tx.actionToken.findUnique({
        where: { userId_type: { userId, type } },
      });
      if (cooldown && previous && Date.now() - previous.createdAt.getTime() < 60000) return false;
      await tx.actionToken.deleteMany({ where: { userId, type } });
      await tx.actionToken.create({
        data: {
          userId,
          type,
          tokenHash: this.tokenHash(token),
          expiresAt: new Date(Date.now() + minutes * 60000),
        },
      });
      return true;
    });
    if (!issued) return [];
    const base = new URL(this.config.getOrThrow<string>('FRONTEND_URL'));
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid FRONTEND_URL');
    const url = new URL(
      type === ActionTokenType.EMAIL_VERIFICATION ? '/verify-email' : '/reset-password',
      base,
    );
    url.searchParams.set('token', token);
    try {
      if (type === ActionTokenType.EMAIL_VERIFICATION)
        await this.mail.sendVerificationEmail(email, url.toString(), minutes);
      else await this.mail.sendPasswordResetEmail(email, url.toString(), minutes);
    } catch {
      this.logger.error({
        message: 'Authentication email delivery failed',
        category: 'MAIL_DELIVERY_FAILED',
        type,
      });
      if (type === ActionTokenType.EMAIL_VERIFICATION) {
        // Preserve the token and its createdAt cooldown after delivery failure.
        return [{ code: VERIFICATION_EMAIL_SEND_FAILED }];
      }
      // Keep the existing password recovery behavior independent of verification.
      await this.prisma.actionToken.deleteMany({
        where: { tokenHash: this.tokenHash(token) },
      });
    }
    return [];
  }
  async resendVerificationEmail(email: string) {
    const user = await this.users.findByEmail(email);
    const warnings =
      user && !user.emailVerifiedAt
        ? await this.issueToken(user.id, user.email, ActionTokenType.EMAIL_VERIFICATION)
        : [];
    return { warnings };
  }
  async forgotPassword(email: string) {
    const user = await this.users.findByEmail(email);
    if (user) await this.issueToken(user.id, user.email, ActionTokenType.PASSWORD_RESET);
    return true;
  }
  private async consumeToken(token: string, type: ActionTokenType, newPassword?: string) {
    const code =
      type === ActionTokenType.EMAIL_VERIFICATION
        ? 'VERIFICATION_TOKEN_INVALID'
        : 'PASSWORD_RESET_TOKEN_INVALID';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw applicationError(code, 'The link is no longer valid.');
    return this.prisma.$transaction(async (tx) => {
      const where = { tokenHash: this.tokenHash(token) };
      const candidate = await tx.actionToken.findUnique({ where });
      if (!candidate) throw applicationError(code, 'The link is no longer valid.');
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId}::uuid FOR UPDATE`;
      const current = await tx.actionToken.findUnique({ where });
      if (!current || current.type !== type || current.expiresAt.getTime() <= Date.now())
        throw applicationError(code, 'The link is no longer valid.');
      await tx.user.update({
        where: { id: current.userId },
        data:
          type === ActionTokenType.EMAIL_VERIFICATION
            ? { emailVerifiedAt: new Date() }
            : { passwordHash: await hash(newPassword!, { type: argon2id }) },
      });
      await tx.actionToken.delete({ where });
      return true;
    });
  }
  verifyEmail(token: string) {
    return this.consumeToken(token, ActionTokenType.EMAIL_VERIFICATION);
  }
  async resetPassword(token: string, newPassword: string) {
    if (newPassword.length < 8 || newPassword.length > 128)
      throw applicationError('VALIDATION_ERROR', 'Password must contain 8 to 128 characters.');
    return this.consumeToken(token, ActionTokenType.PASSWORD_RESET, newPassword);
  }
  async me(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw applicationError('USER_NOT_FOUND', 'The authenticated user no longer exists.');
    return publicUser(user);
  }
}
