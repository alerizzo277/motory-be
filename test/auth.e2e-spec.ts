import { GraphqlExceptionFilter } from '../dist/common/graphql-exception.filter.js';
import { readFileSync } from 'node:fs';
import { buildClientSchema, getIntrospectionQuery, parse, validate } from 'graphql';
import { Test } from '@nestjs/testing';
import { BadGatewayException, Logger, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createHash, randomUUID } from 'node:crypto';
import { verify } from 'argon2';
// Compiled Nest classes retain decorator metadata, including DTO validation types.
import { AuthModule } from '../dist/auth/auth.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { Prisma } from '../dist/generated/prisma/client.js';
import { formatGraphqlError } from '../dist/common/graphql-errors.js';
import { MailService } from '../dist/mail/mail.service.js';
import type { ActionToken, Role, User } from '../src/generated/prisma/client.js';

describe('Authentication GraphQL', () => {
  let app: INestApplication<App>;
  let stored: User | null;
  let roles: Role[];
  let tokens: ActionToken[] = [];
  const mail = {
    sendVerificationEmail: vi.fn().mockResolvedValue({ id: 'mail' }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ id: 'mail' }),
  };
  const digest = (token: string) => createHash('sha256').update(token).digest('hex');
  const rawToken = (reset = false): string => {
    const calls = (reset ? mail.sendPasswordResetEmail : mail.sendVerificationEmail).mock.calls;
    return new URL(calls.at(-1)![1] as string).searchParams.get('token')!;
  };
  const verifyEmail = 'mutation($token: String!) { verifyEmail(token: $token) }';
  const resend =
    'mutation($input: EmailInput!) { resendVerificationEmail(input: $input) { warnings { code } } }';
  const forgot = 'mutation($input: EmailInput!) { forgotPassword(input: $input) }';
  const reset = 'mutation($input: ResetPasswordInput!) { resetPassword(input: $input) }';
  let failDatabase = false;
  const secret = 'test-only-secret-with-at-least-32-characters';
  const fields = 'id email firstName lastName role createdAt updatedAt';
  const register =
    'mutation($input: RegisterInput!) { register(input: $input) { user { ' +
    fields +
    ' } warnings { code } } }';
  const login =
    'mutation($input: LoginInput!) { login(input: $input) { accessToken user { ' +
    fields +
    ' } } }';
  const input = {
    email: '  Alice@Example.com ',
    password: 'password123',
    firstName: ' Alice ',
    lastName: ' Rossi ',
  };
  type TokenWhere = {
    tokenHash?: string;
    userId?: string;
    type?: string;
    userId_type?: { userId: string; type: string };
  };
  const matches = (item: ActionToken, where: TokenWhere) =>
    (!where.tokenHash || item.tokenHash === where.tokenHash) &&
    (!where.userId || item.userId === where.userId) &&
    (!where.type || item.type === where.type) &&
    (!where.userId_type ||
      (item.userId === where.userId_type.userId && item.type === where.userId_type.type));
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    actionToken: {
      findUnique: vi.fn(({ where }: { where: TokenWhere }) =>
        Promise.resolve(tokens.find((item) => matches(item, where)) ?? null),
      ),
      deleteMany: vi.fn(({ where }: { where: TokenWhere }) => {
        const before = tokens.length;
        tokens = tokens.filter((item) => !matches(item, where));
        return Promise.resolve({ count: before - tokens.length });
      }),
      delete: vi.fn(({ where }: { where: TokenWhere }) => {
        const found = tokens.find((item) => matches(item, where));
        tokens = tokens.filter((item) => !matches(item, where));
        return Promise.resolve(found);
      }),
      create: vi.fn(({ data }: { data: Omit<ActionToken, 'id' | 'createdAt'> }) => {
        const item = { ...data, id: randomUUID(), createdAt: new Date() };
        tokens.push(item);
        return Promise.resolve(item);
      }),
    },
    role: {
      findUnique: vi.fn(({ where }: { where: { name: string } }) =>
        Promise.resolve(roles.find((role) => role.name === where.name) ?? null),
      ),
    },
    user: {
      update: vi.fn(({ data }: { data: Partial<User> }) => {
        Object.assign(stored!, data);
        return Promise.resolve(stored);
      }),
      findUnique: vi.fn(({ where }: { where: { email?: string; id?: string } }) => {
        if (failDatabase) throw new Error('Sensitive database detail');
        return Promise.resolve(
          stored && (stored.email === where.email || stored.id === where.id)
            ? {
                ...stored,
                role: roles.find((role) => role.id === stored!.roleId)!,
              }
            : null,
        );
      }),
      create: vi.fn(({ data }: { data: Omit<User, 'id' | 'createdAt' | 'updatedAt'> }) => {
        stored = {
          ...data,
          emailVerifiedAt: null,
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return Promise.resolve({
          ...stored,
          role: roles.find((role) => role.id === data.roleId)!,
        });
      }),
    },
  };
  const transactionalPrisma = {
    ...prisma,
    $transaction: async (callback: (tx: typeof prisma) => Promise<unknown>) => {
      const beforeUser = stored ? { ...stored } : null;
      const beforeTokens = [...tokens];
      try {
        return await callback(prisma);
      } catch (error) {
        stored = beforeUser;
        tokens = beforeTokens;
        throw error;
      }
    },
  };
  function gql(query: string, variables = {}, token?: string) {
    const req = request(app.getHttpServer()).post('/graphql');
    if (token) req.set('Authorization', 'Bearer ' + token);
    return req.send({ query, variables });
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: secret,
              JWT_EXPIRES_IN: '3600',
              FRONTEND_URL: 'https://motory.example',
              EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: '1440',
              PASSWORD_RESET_TOKEN_TTL_MINUTES: '60',
            }),
          ],
        }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          includeStacktraceInErrorResponses: false,
          formatError: formatGraphqlError,
        }),
        AuthModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(transactionalPrisma)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalFilters(new GraphqlExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    stored = null;
    tokens = [];
    roles = [
      { id: randomUUID(), name: 'USER' },
      { id: randomUUID(), name: 'ADMIN' },
    ];
    vi.clearAllMocks();
    failDatabase = false;
  });
  afterAll(async () => {
    await app?.close();
  });
  it('registers without login, hashes with Argon2id, logs in and reads fresh user data', async () => {
    const sign = vi.spyOn(app.get(JwtService), 'signAsync');
    const registered = await gql(register, { input });
    expect(sign).not.toHaveBeenCalled();
    sign.mockRestore();
    expect(registered.body.errors).toBeUndefined();
    expect(registered.body.data.register.user).toMatchObject({
      email: 'alice@example.com',
      firstName: 'Alice',
      role: 'USER',
    });
    expect(registered.body.data.register.user.accessToken).toBeUndefined();
    expect(registered.body.data.register.user.passwordHash).toBeUndefined();
    expect(stored?.roleId).toBe(roles.find((role) => role.name === 'USER')!.id);
    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'USER' },
    });
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(stored!.passwordHash, input.password)).toBe(true);
    stored!.emailVerifiedAt = new Date();
    const authenticated = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    expect(authenticated.body.errors).toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'alice@example.com' },
      include: { role: true },
    });
    const token: string = authenticated.body.data.login.accessToken;
    expect(app.get(JwtService).verify(token)).toMatchObject({
      sub: stored!.id,
      role: 'USER',
      exp: expect.any(Number),
    });
    stored!.firstName = 'Updated';
    const me = await gql('{ me { ' + fields + ' } }', {}, token);
    expect(me.body.data.me.firstName).toBe('Updated');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: stored!.id },
      include: { role: true },
    });
    expect(me.body.data.me.passwordHash).toBeUndefined();
  });
  it('rejects duplicate normalized email', async () => {
    await gql(register, { input });
    const result = await gql(register, {
      input: { ...input, email: 'ALICE@example.com' },
    });
    expect(result.body.errors[0].extensions.code).toBe('EMAIL_ALREADY_EXISTS');
  });
  it('preserves password whitespace during registration and login', async () => {
    const password = ' password123 ';
    const result = await gql(register, { input: { ...input, password } });
    expect(result.body.errors).toBeUndefined();
    expect(await verify(stored!.passwordHash, password)).toBe(true);
    expect(await verify(stored!.passwordHash, password.trim())).toBe(false);
    stored!.emailVerifiedAt = new Date();
    expect(
      (await gql(login, { input: { email: input.email, password } })).body.errors,
    ).toBeUndefined();
  });
  it.each(['role', 'roleId'])('rejects client-controlled %s before persistence', async (field) => {
    const result = await gql(register, {
      input: { ...input, [field]: 'ADMIN' },
    });
    expect(result.body.errors[0].extensions.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(stored).toBeNull();
  });
  it('maps a concurrent email collision without leaking Prisma details', async () => {
    prisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Private SQL detail', {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { target: ['email'] },
      }),
    );
    const result = await gql(register, { input });
    expect(result.body.errors[0].extensions).toEqual({
      code: 'EMAIL_ALREADY_EXISTS',
    });
    expect(JSON.stringify(result.body)).not.toContain('Private SQL detail');
    expect(JSON.stringify(result.body)).not.toContain('P2002');
  });
  it('keeps the registration input limited to the four public fields', async () => {
    const result = await gql('{ __type(name: "RegisterInput") { inputFields { name } } }');
    expect(
      result.body.data.__type.inputFields.map((field: { name: string }) => field.name).sort(),
    ).toEqual(['email', 'firstName', 'lastName', 'password']);
  });
  it('uses identical errors for absent email and incorrect password', async () => {
    await gql(register, { input });
    const wrong = await gql(login, {
      input: { email: input.email, password: 'wrong' },
    });
    const missing = await gql(login, {
      input: { email: 'absent@example.com', password: 'wrong' },
    });
    expect(wrong.body.errors).toEqual(missing.body.errors);
    expect(wrong.body.errors[0].extensions.code).toBe('INVALID_CREDENTIALS');
  });
  it('rejects missing, invalid, expired tokens and malformed identity', async () => {
    const jwt = app.get(JwtService);
    const expired = jwt.sign({ sub: randomUUID(), role: 'USER' }, { expiresIn: -1 });
    const malformed = jwt.sign({ sub: 'bad-id', role: 'USER' });
    for (const token of [undefined, 'invalid', expired, malformed]) {
      const result = await gql('{ me { id } }', {}, token);
      expect(result.body.errors[0].extensions).toEqual({
        code: 'UNAUTHENTICATED',
      });
    }
  });
  it('handles a deleted user', async () => {
    const token = app.get(JwtService).sign({ sub: randomUUID(), role: 'USER' });
    const result = await gql('{ me { id } }', {}, token);
    expect(result.body.errors[0].extensions.code).toBe('USER_NOT_FOUND');
  });
  it('validates normalized inputs and omits internal details', async () => {
    const result = await gql(register, {
      input: { ...input, password: 'short', firstName: '  ' },
    });
    expect(result.body.errors[0].extensions.code).toBe('VALIDATION_ERROR');
    expect(
      result.body.errors[0].extensions.fields.map((field: { field: string }) => field.field),
    ).toEqual(expect.arrayContaining(['password', 'firstName']));
    expect(stored).toBeNull();
    failDatabase = true;
    const failure = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    expect(failure.body.errors[0].extensions).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(JSON.stringify(failure.body)).not.toContain('Sensitive database detail');
  });
  it('derives ADMIN and future role codes from the relation for login and fresh me', async () => {
    await gql(register, { input });
    stored!.roleId = roles.find((role) => role.name === 'ADMIN')!.id;
    stored!.emailVerifiedAt = new Date();
    const authenticated = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    const token: string = authenticated.body.data.login.accessToken;
    expect(authenticated.body.data.login.user.role).toBe('ADMIN');
    expect(app.get(JwtService).verify(token).role).toBe('ADMIN');
    expect((await gql('{ me { role } }', {}, token)).body.data.me.role).toBe('ADMIN');
    const futureRole = { id: randomUUID(), name: 'MECHANIC' };
    roles.push(futureRole);
    stored!.roleId = futureRole.id;
    expect((await gql('{ me { role } }', {}, token)).body.data.me.role).toBe('MECHANIC');
    const futureLogin = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    const futureToken: string = futureLogin.body.data.login.accessToken;
    expect(app.get(JwtService).verify(futureToken).role).toBe('MECHANIC');
    expect((await gql('{ me { role } }', {}, futureToken)).body.data.me.role).toBe('MECHANIC');
  });
  it('returns a server error without creating users when USER is not seeded', async () => {
    roles = roles.filter((role) => role.name !== 'USER');
    const result = await gql(register, { input });
    expect(result.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(stored).toBeNull();
  });
  it('does not expose passwordHash in the GraphQL schema', async () => {
    const result = await gql('{ __type(name: "User") { fields { name } } }');
    const names = result.body.data.__type.fields.map((field: { name: string }) => field.name);
    expect(names).not.toContain('passwordHash');
    expect(names).not.toContain('roleId');
  });
  it('registers unverified with only a SHA-256 token and sends the configured verification URL', async () => {
    await gql(register, { input });
    expect(stored!.emailVerifiedAt).toBeNull();
    const token = rawToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(digest(token));
    expect(JSON.stringify(tokens)).not.toContain(token);
    expect(tokens[0].type).toBe('EMAIL_VERIFICATION');
    expect(tokens[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(1439 * 60000);
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.stringContaining('https://motory.example/verify-email?token='),
      1440,
    );
    const sign = vi.spyOn(app.get(JwtService), 'signAsync');
    const result = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    expect(result.body.errors[0].extensions.code).toBe('EMAIL_NOT_VERIFIED');
    expect(sign).not.toHaveBeenCalled();
    sign.mockRestore();
  });
  it('verifies once, deletes the token and then allows login', async () => {
    await gql(register, { input });
    const token = rawToken();
    expect((await gql(verifyEmail, { token })).body.data.verifyEmail).toBe(true);
    expect(stored!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(tokens).toHaveLength(0);
    expect((await gql(verifyEmail, { token })).body.errors[0].extensions.code).toBe(
      'VERIFICATION_TOKEN_INVALID',
    );
    expect(
      (
        await gql(login, {
          input: { email: input.email, password: input.password },
        })
      ).body.data.login.accessToken,
    ).toEqual(expect.any(String));
  });
  it('rejects expired, missing and wrong-type verification tokens', async () => {
    await gql(register, { input });
    tokens[0].expiresAt = new Date(Date.now() - 1);
    for (const token of [rawToken(), 'missing'])
      expect((await gql(verifyEmail, { token })).body.errors[0].extensions.code).toBe(
        'VERIFICATION_TOKEN_INVALID',
      );
    await gql(forgot, { input: { email: input.email } });
    expect((await gql(verifyEmail, { token: rawToken(true) })).body.errors[0].extensions.code).toBe(
      'VERIFICATION_TOKEN_INVALID',
    );
    expect(stored!.emailVerifiedAt).toBeNull();
  });
  it('resends after cooldown, replaces old token and returns neutral responses', async () => {
    await gql(register, { input });
    const original = rawToken();
    const variables = { input: { email: input.email } };
    const first = await gql(resend, variables);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    tokens[0].createdAt = new Date(Date.now() - 61000);
    expect((await gql(resend, variables)).body).toEqual(first.body);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(2);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).not.toBe(digest(original));
    expect((await gql(verifyEmail, { token: original })).body.errors[0].extensions.code).toBe(
      'VERIFICATION_TOKEN_INVALID',
    );
    expect((await gql(resend, { input: { email: 'missing@example.com' } })).body).toEqual(
      first.body,
    );
    await gql(verifyEmail, { token: rawToken() });
    expect((await gql(resend, variables)).body).toEqual(first.body);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });
  it('forgot is neutral, cooldown applies and reset replaces password without verifying email', async () => {
    await gql(register, { input });
    const missing = await gql(forgot, {
      input: { email: 'missing@example.com' },
    });
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect((await gql(forgot, { input: { email: input.email } })).body).toEqual(missing.body);
    const original = rawToken(true);
    await gql(forgot, { input: { email: input.email } });
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const resetToken = tokens.find((item) => item.type === 'PASSWORD_RESET')!;
    expect(resetToken.tokenHash).toBe(digest(original));
    expect(resetToken.expiresAt.getTime() - Date.now()).toBeGreaterThan(59 * 60000);
    resetToken.createdAt = new Date(Date.now() - 61000);
    await gql(forgot, { input: { email: input.email } });
    expect(
      (
        await gql(reset, {
          input: { token: original, newPassword: 'new-password' },
        })
      ).body.errors[0].extensions.code,
    ).toBe('PASSWORD_RESET_TOKEN_INVALID');
    const token = rawToken(true);
    expect(
      (await gql(reset, { input: { token, newPassword: ' new-password ' } })).body.data
        .resetPassword,
    ).toBe(true);
    expect(stored!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(stored!.passwordHash, ' new-password ')).toBe(true);
    expect(await verify(stored!.passwordHash, input.password)).toBe(false);
    expect(stored!.emailVerifiedAt).toBeNull();
    expect(tokens.filter((item) => item.type === 'PASSWORD_RESET')).toHaveLength(0);
    expect(
      (await gql(reset, { input: { token, newPassword: 'new-password' } })).body.errors[0]
        .extensions.code,
    ).toBe('PASSWORD_RESET_TOKEN_INVALID');
    await gql(verifyEmail, { token: rawToken() });
    expect(
      (
        await gql(login, {
          input: { email: input.email, password: ' new-password ' },
        })
      ).body.data.login.accessToken,
    ).toEqual(expect.any(String));
    expect(
      (
        await gql(login, {
          input: { email: input.email, password: input.password },
        })
      ).body.errors[0].extensions.code,
    ).toBe('INVALID_CREDENTIALS');
  });
  it('rejects expired reset token and invalid passwords without consuming it', async () => {
    await gql(register, { input });
    await gql(forgot, { input: { email: input.email } });
    const token = rawToken(true);
    expect(
      (await gql(reset, { input: { token, newPassword: 'short' } })).body.errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
    tokens.find((item) => item.type === 'PASSWORD_RESET')!.expiresAt = new Date(Date.now() - 1);
    expect(
      (await gql(reset, { input: { token, newPassword: 'new-password' } })).body.errors[0]
        .extensions.code,
    ).toBe('PASSWORD_RESET_TOKEN_INVALID');
    expect(await verify(stored!.passwordHash, input.password)).toBe(true);
  });
  it('rejects client-controlled verification status and token type', async () => {
    expect(
      (
        await gql(register, {
          input: { ...input, emailVerifiedAt: new Date().toISOString() },
        })
      ).body.errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
    expect(
      (
        await gql(forgot, {
          input: { email: input.email, type: 'EMAIL_VERIFICATION' },
        })
      ).body.errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
  });
  it('keeps recovery neutral on provider failure and permits a later retry', async () => {
    await gql(register, { input });
    mail.sendPasswordResetEmail.mockRejectedValueOnce(new Error('Provider detail'));
    const failure = await gql(forgot, { input: { email: input.email } });
    expect(failure.body.data.forgotPassword).toBe(true);
    expect(tokens.filter((item) => item.type === 'PASSWORD_RESET')).toHaveLength(0);
    await gql(forgot, { input: { email: input.email } });
    expect(tokens.filter((item) => item.type === 'PASSWORD_RESET')).toHaveLength(1);
  });
  it('validates every frontend operation against the real resolver schema', async () => {
    const operations = readFileSync(
      new URL('../../motory-fe/src/features/auth/api/operations.ts', import.meta.url),
      'utf8',
    );
    const documents = [...operations.matchAll(/gql`([\s\S]*?)`/g)];
    expect(documents).toHaveLength(7);
    const schema = buildClientSchema((await gql(getIntrospectionQuery())).body.data);
    for (const [, document] of documents) expect(validate(schema, parse(document))).toEqual([]);
  });
  it('does not log expected authentication and validation failures', async () => {
    const log = vi.spyOn(Logger.prototype, 'error');
    await gql(login, { input: { email: input.email, password: input.password } });
    await gql(register, { input: { ...input, password: 'short' } });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it('rolls back verification if token deletion fails', async () => {
    const log = vi.spyOn(Logger.prototype, 'error');
    await gql(register, { input });
    prisma.actionToken.delete.mockRejectedValueOnce(new Error('Delete failure'));
    const token = rawToken();
    expect((await gql(verifyEmail, { token })).body.errors[0].extensions.code).toBe(
      'INTERNAL_SERVER_ERROR',
    );
    expect(log).toHaveBeenCalledExactlyOnceWith({
      message: 'Unexpected GraphQL failure',
      category: 'INTERNAL_SERVER_ERROR',
    });
    log.mockRestore();
    expect(stored!.emailVerifiedAt).toBeNull();
    expect(tokens).toHaveLength(1);
    expect((await gql(verifyEmail, { token })).body.data.verifyEmail).toBe(true);
  });
  it('returns registration success with a warning and preserves user and token on mail failure', async () => {
    const log = vi.spyOn(Logger.prototype, 'error');
    const cause = {
      statusCode: 403,
      name: 'validation_error',
      message: 'Private provider message',
    };
    mail.sendVerificationEmail.mockRejectedValueOnce(
      new BadGatewayException('Unable to send email', { cause }),
    );
    const result = await gql(register, { input });
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.register.user.email).toBe('alice@example.com');
    expect(result.body.data.register.warnings).toEqual([
      { code: 'VERIFICATION_EMAIL_SEND_FAILED' },
    ]);
    expect(log).toHaveBeenCalledExactlyOnceWith({
      message: 'Authentication email delivery failed',
      category: 'MAIL_DELIVERY_FAILED',
      type: 'EMAIL_VERIFICATION',
    });
    log.mockRestore();
    expect(stored!.emailVerifiedAt).toBeNull();
    expect(tokens).toHaveLength(1);
    expect(prisma.actionToken.deleteMany).toHaveBeenCalledTimes(1); // Replacement before creation only.
    expect(JSON.stringify(result.body)).not.toMatch(
      /Resend|403|validation_error|private provider message/,
    );
    const before = tokens[0].id;
    await gql(resend, { input: { email: input.email } });
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(tokens[0].id).toBe(before);
    tokens[0].createdAt = new Date(Date.now() - 60000);
    expect(
      (await gql(resend, { input: { email: input.email } })).body.data.resendVerificationEmail
        .warnings,
    ).toEqual([]);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });
  it('returns no warnings when registration mail succeeds', async () => {
    const result = await gql(register, { input });
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.register.warnings).toEqual([]);
    expect(stored).not.toBeNull();
    expect(tokens).toHaveLength(1);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    'keeps duplicate registration identical for verified=%s',
    async (verified) => {
      await gql(register, { input });
      if (verified) stored!.emailVerifiedAt = new Date();
      const result = await gql(register, { input });
      expect(result.body.errors[0].extensions.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves resend token and cooldown on delivery failure without exposing provider details', async () => {
    await gql(register, { input });
    tokens[0].createdAt = new Date(Date.now() - 60000);
    const oldId = tokens[0].id;
    mail.sendVerificationEmail.mockRejectedValueOnce(new Error('Private provider failure'));
    const result = await gql(resend, { input: { email: input.email } });
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.resendVerificationEmail.warnings).toEqual([
      { code: 'VERIFICATION_EMAIL_SEND_FAILED' },
    ]);
    expect(JSON.stringify(result.body)).not.toContain('Private provider failure');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].id).not.toBe(oldId);
    const newId = tokens[0].id;
    await gql(resend, { input: { email: input.email } });
    await gql(resend, { input: { email: input.email } });
    expect(tokens[0].id).toBe(newId);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(2);
    expect(stored!.emailVerifiedAt).toBeNull();
  });
});
