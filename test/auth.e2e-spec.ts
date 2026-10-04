import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { randomUUID } from 'node:crypto';
import { verify } from 'argon2';
// Compiled Nest classes retain decorator metadata, including DTO validation types.
import { AuthModule } from '../dist/auth/auth.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { formatGraphqlError } from '../dist/common/graphql-errors.js';
import type { Role, User } from '../src/generated/prisma/client.js';

describe('Authentication GraphQL', () => {
  let app: INestApplication<App>;
  let stored: User | null;
  let roles: Role[];
  let failDatabase = false;
  const secret = 'test-only-secret-with-at-least-32-characters';
  const fields = 'id email firstName lastName role createdAt updatedAt';
  const register =
    'mutation($input: RegisterInput!) { register(input: $input) { ' +
    fields +
    ' } }';
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
  const prisma = {
    role: {
      findUnique: vi.fn(({ where }: { where: { name: string } }) =>
        Promise.resolve(roles.find((role) => role.name === where.name) ?? null),
      ),
    },
    user: {
      findUnique: vi.fn(
        ({ where }: { where: { email?: string; id?: string } }) => {
          if (failDatabase) throw new Error('Sensitive database detail');
          return Promise.resolve(
            stored && (stored.email === where.email || stored.id === where.id)
              ? {
                  ...stored,
                  role: roles.find((role) => role.id === stored!.roleId)!,
                }
              : null,
          );
        },
      ),
      create: vi.fn(
        ({ data }: { data: Omit<User, 'id' | 'createdAt' | 'updatedAt'> }) => {
          stored = {
            ...data,
            id: randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return Promise.resolve({
            ...stored,
            role: roles.find((role) => role.id === data.roleId)!,
          });
        },
      ),
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
          load: [() => ({ JWT_SECRET: secret, JWT_EXPIRES_IN: '3600' })],
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
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    stored = null;
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
    const registered = await gql(register, { input });
    expect(registered.body.errors).toBeUndefined();
    expect(registered.body.data.register).toMatchObject({
      email: 'alice@example.com',
      firstName: 'Alice',
      role: 'USER',
    });
    expect(registered.body.data.register.accessToken).toBeUndefined();
    expect(registered.body.data.register.passwordHash).toBeUndefined();
    expect(stored?.roleId).toBe(roles.find((role) => role.name === 'USER')!.id);
    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'USER' },
    });
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(stored!.passwordHash, input.password)).toBe(true);
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
    const expired = jwt.sign(
      { sub: randomUUID(), role: 'USER' },
      { expiresIn: -1 },
    );
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
      result.body.errors[0].extensions.fields.map(
        (field: { field: string }) => field.field,
      ),
    ).toEqual(expect.arrayContaining(['password', 'firstName']));
    expect(stored).toBeNull();
    failDatabase = true;
    const failure = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    expect(failure.body.errors[0].extensions).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(JSON.stringify(failure.body)).not.toContain(
      'Sensitive database detail',
    );
  });
  it('derives ADMIN and future role codes from the relation for login and fresh me', async () => {
    await gql(register, { input });
    stored!.roleId = roles.find((role) => role.name === 'ADMIN')!.id;
    const authenticated = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    const token: string = authenticated.body.data.login.accessToken;
    expect(authenticated.body.data.login.user.role).toBe('ADMIN');
    expect(app.get(JwtService).verify(token).role).toBe('ADMIN');
    expect((await gql('{ me { role } }', {}, token)).body.data.me.role).toBe(
      'ADMIN',
    );
    const futureRole = { id: randomUUID(), name: 'MECHANIC' };
    roles.push(futureRole);
    stored!.roleId = futureRole.id;
    expect((await gql('{ me { role } }', {}, token)).body.data.me.role).toBe(
      'MECHANIC',
    );
    const futureLogin = await gql(login, {
      input: { email: input.email, password: input.password },
    });
    const futureToken: string = futureLogin.body.data.login.accessToken;
    expect(app.get(JwtService).verify(futureToken).role).toBe('MECHANIC');
    expect(
      (await gql('{ me { role } }', {}, futureToken)).body.data.me.role,
    ).toBe('MECHANIC');
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
    const names = result.body.data.__type.fields.map(
      (field: { name: string }) => field.name,
    );
    expect(names).not.toContain('passwordHash');
    expect(names).not.toContain('roleId');
  });
});
