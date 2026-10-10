import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { JwtService } from '@nestjs/jwt';
import { buildClientSchema, getIntrospectionQuery } from 'graphql';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AdminModule } from '../dist/admin/admin.module.js';
import { MailService } from '../dist/mail/mail.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { formatGraphqlError } from '../dist/common/graphql-errors.js';

const secret = 'admin-test-secret-with-at-least-32-characters';
const adminId = randomUUID();
const userId = randomUUID();
const fields = 'id firstName lastName email createdAt emailVerified roles';
const dashboard = `query { adminDashboard { totalUsers verifiedUsers activeVehicles deletedVehicles totalMaintenanceEvents recentUsers { ${fields} } } }`;
const list = `query($page: Int, $pageSize: Int, $search: String) { adminUsers(page: $page, pageSize: $pageSize, search: $search) { items { ${fields} } totalCount page pageSize totalPages } }`;
const detail = `query($id: ID!) { adminUser(id: $id) { ${fields} activity { activeVehiclesCount deletedVehiclesCount totalMaintenanceEventsCount } } }`;
interface Row {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  role: { name: string };
}
interface Where {
  OR?: Where[];
  AND?: Where[];
  firstName?: { contains: string };
  lastName?: { contains: string };
  email?: { contains: string };
  emailVerifiedAt?: { not: null };
}
function matches(row: Row, where: Where): boolean {
  if (where.OR) return where.OR.some((w) => matches(row, w));
  if (where.AND) return where.AND.every((w) => matches(row, w));
  for (const field of ['firstName', 'lastName', 'email'] as const)
    if (where[field] && !row[field].toLowerCase().includes(where[field].contains.toLowerCase()))
      return false;
  return !where.emailVerifiedAt || row.emailVerifiedAt !== null;
}

describe('Read-only admin GraphQL', () => {
  let app: INestApplication<App>;
  let users: Row[];
  let vehicles: { id: string; userId: string; deletedAt: Date | null }[];
  let events: { vehicleId: string }[];
  let fail: boolean;
  const prisma = {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        if (fail) throw new Error('private database details');
        return Promise.resolve(users.find((u) => u.id === where.id) ?? null);
      }),
      count: vi.fn(({ where = {} }: { where?: Where } = {}) =>
        Promise.resolve(users.filter((u) => matches(u, where)).length),
      ),
      findMany: vi.fn(
        ({ where = {}, skip = 0, take }: { where?: Where; skip?: number; take: number }) =>
          Promise.resolve(
            users
              .filter((u) => matches(u, where))
              .sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
              )
              .slice(skip, skip + take),
          ),
      ),
    },
    vehicle: {
      count: vi.fn(({ where }: { where: { userId?: string; deletedAt: null | { not: null } } }) =>
        Promise.resolve(
          vehicles.filter(
            (v) =>
              (!where.userId || v.userId === where.userId) &&
              (where.deletedAt === null ? v.deletedAt === null : v.deletedAt !== null),
          ).length,
        ),
      ),
    },
    maintenanceEvent: {
      count: vi.fn(({ where }: { where?: { vehicle: { userId: string } } } = {}) =>
        Promise.resolve(
          events.filter(
            (e) =>
              !where ||
              vehicles.some((v) => v.id === e.vehicleId && v.userId === where.vehicle.userId),
          ).length,
        ),
      ),
    },
  };
  function gql(query: string, variables = {}, actor: string | null = adminId, role = 'USER') {
    const req = request(app.getHttpServer()).post('/graphql');
    if (actor)
      req.set(
        'Authorization',
        'Bearer ' + new JwtService().sign({ sub: actor, role }, { secret, expiresIn: 3600 }),
      );
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
              FRONTEND_URL: 'https://example.com',
            }),
          ],
        }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          formatError: formatGraphqlError,
          includeStacktraceInErrorResponses: false,
        }),
        AdminModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    fail = false;
    users = Array.from({ length: 7 }, (_, i) => ({
      id: i === 0 ? adminId : i === 1 ? userId : randomUUID(),
      firstName: i === 2 ? 'Alice Maria' : 'Bob',
      lastName: i === 2 ? 'De Rossi' : 'Smith',
      email: `person${i}@example.com`,
      createdAt: new Date('2026-01-01'),
      emailVerifiedAt: i % 2 ? null : new Date(),
      role: { name: i === 0 ? 'ADMIN' : 'USER' },
    }));
    vehicles = [
      { id: randomUUID(), userId, deletedAt: null },
      { id: randomUUID(), userId, deletedAt: new Date('2000-01-01') },
      { id: randomUUID(), userId: adminId, deletedAt: null },
    ];
    events = vehicles.map((v) => ({ vehicleId: v.id }));
  });
  it.each([dashboard, list, detail])(
    'enforces authentication and persisted ADMIN role for %s',
    async (query) => {
      const variables = { id: adminId };
      expect((await gql(query, variables, null)).body.errors[0].extensions.code).toBe(
        'UNAUTHENTICATED',
      );
      expect((await gql(query, variables, userId, 'ADMIN')).body.errors[0].extensions.code).toBe(
        'FORBIDDEN',
      );
      expect((await gql(query, variables)).body.errors).toBeUndefined();
      expect(
        (await gql(query, variables, randomUUID(), 'ADMIN')).body.errors[0].extensions.code,
      ).toBe('UNAUTHENTICATED');
      users[0].role.name = 'USER';
      expect((await gql(query, variables, adminId, 'ADMIN')).body.errors[0].extensions.code).toBe(
        'FORBIDDEN',
      );
    },
  );
  it('rejects malformed, expired and incorrectly signed JWTs', async () => {
    const jwt = new JwtService();
    for (const token of [
      'invalid',
      jwt.sign({ sub: adminId, role: 'ADMIN' }, { secret, expiresIn: -1 }),
      jwt.sign({ sub: adminId, role: 'ADMIN' }, { secret: 'incorrect-secret', expiresIn: 3600 }),
    ]) {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', 'Bearer ' + token)
        .send({ query: dashboard });
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('counts all persisted records including long-expired deleted vehicles and orders five recent users', async () => {
    const result = (await gql(dashboard)).body.data.adminDashboard;
    expect(result).toMatchObject({
      totalUsers: 7,
      verifiedUsers: 4,
      activeVehicles: 2,
      deletedVehicles: 1,
      totalMaintenanceEvents: 3,
    });
    expect(result.recentUsers.map((u: Row) => u.id)).toEqual(
      users
        .map((u) => u.id)
        .sort()
        .reverse()
        .slice(0, 5),
    );
    users[1].createdAt = new Date('2027-01-01');
    expect((await gql(dashboard)).body.data.adminDashboard.recentUsers[0].id).toBe(userId);
  });
  it.each(['alice', 'ROSSI', 'PERSON2@EXAMPLE', '  Alice   De Rossi  ', 'Maria Rossi'])(
    'searches names and email with normalized insensitive input %s',
    async (search) => {
      const result = (await gql(list, { search })).body.data.adminUsers;
      expect(result.totalCount).toBe(1);
      expect(result.items[0].id).toBe(users[2].id);
    },
  );
  it('paginates deterministically with matching counts, defaults and empty results', async () => {
    const first = (await gql(list, { pageSize: 2 })).body.data.adminUsers;
    const second = (await gql(list, { page: 2, pageSize: 2 })).body.data.adminUsers;
    expect(first).toMatchObject({ page: 1, pageSize: 2, totalCount: 7, totalPages: 4 });
    expect([...first.items, ...second.items].map((u: Row) => u.id)).toEqual(
      users
        .map((u) => u.id)
        .sort()
        .reverse()
        .slice(0, 4),
    );
    expect((await gql(list, { search: ' \t ' })).body.data.adminUsers).toMatchObject({
      totalCount: 7,
      pageSize: 20,
    });
    expect(
      (await gql(list, { search: 'Bob', pageSize: 2, page: 2 })).body.data.adminUsers,
    ).toMatchObject({ totalCount: 6, totalPages: 3, page: 2 });
    expect((await gql(list, { pageSize: 100 })).body.data.adminUsers.items).toHaveLength(7);
    expect((await gql(list, { search: 'absent' })).body.data.adminUsers).toMatchObject({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });
    expect((await gql(list, { page: 100 })).body.data.adminUsers.items).toEqual([]);
  });
  it.each([
    { page: 0 },
    { page: -1 },
    { page: 1.2 },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: -1 },
  ])('rejects invalid pagination %j', async (variables) => {
    expect((await gql(list, variables)).body.errors[0].extensions.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('returns only the requested account and numeric activity, with controlled ID errors', async () => {
    expect((await gql(detail, { id: userId })).body.data.adminUser).toMatchObject({
      id: userId,
      roles: ['USER'],
      emailVerified: false,
      activity: { activeVehiclesCount: 1, deletedVehiclesCount: 1, totalMaintenanceEventsCount: 2 },
    });
    expect((await gql(detail, { id: adminId })).body.data.adminUser).toMatchObject({
      roles: ['ADMIN'],
      activity: { totalMaintenanceEventsCount: 1 },
    });
    expect((await gql(detail, { id: randomUUID() })).body.errors[0].extensions.code).toBe(
      'USER_NOT_FOUND',
    );
    expect((await gql(detail, { id: 'invalid' })).body.errors[0].extensions.code).toBe(
      'VALIDATION_ERROR',
    );
  });
  it('keeps dashboard and user totals consistent after soft deletion, restoration and physical event deletion', async () => {
    vehicles[0].deletedAt = new Date();
    expect((await gql(dashboard)).body.data.adminDashboard).toMatchObject({
      activeVehicles: 1,
      deletedVehicles: 2,
      totalMaintenanceEvents: 3,
    });
    expect((await gql(detail, { id: userId })).body.data.adminUser.activity).toEqual({
      activeVehiclesCount: 0,
      deletedVehiclesCount: 2,
      totalMaintenanceEventsCount: 2,
    });
    vehicles[0].deletedAt = null;
    expect((await gql(detail, { id: userId })).body.data.adminUser.activity).toEqual({
      activeVehiclesCount: 1,
      deletedVehiclesCount: 1,
      totalMaintenanceEventsCount: 2,
    });
    expect((await gql(dashboard)).body.data.adminDashboard).toMatchObject({
      activeVehicles: 2,
      deletedVehicles: 1,
      totalMaintenanceEvents: 3,
    });
    events.shift();
    expect((await gql(dashboard)).body.data.adminDashboard.totalMaintenanceEvents).toBe(2);
    expect(
      (await gql(detail, { id: userId })).body.data.adminUser.activity.totalMaintenanceEventsCount,
    ).toBe(1);
  });
  it('masks unexpected database failures', async () => {
    fail = true;
    expect((await gql(dashboard)).body.errors[0]).toMatchObject({
      message: 'An unexpected error occurred.',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  });
  it('generates explicit safe schema types and no administrative mutations', async () => {
    const schema = buildClientSchema((await gql(getIntrospectionQuery())).body.data);
    const names = (name: string) => {
      const type = schema.getType(name);
      return type && 'getFields' in type ? Object.keys(type.getFields()) : [];
    };
    const queryFields = schema.getQueryType()!.getFields();
    expect(String(queryFields.adminDashboard.type)).toBe('AdminDashboard!');
    expect(String(queryFields.adminUsers.type)).toBe('AdminUsersPage!');
    expect(String(queryFields.adminUser.type)).toBe('AdminUserDetail!');
    expect(queryFields.adminUser.args.map((a) => [a.name, String(a.type)])).toEqual([
      ['id', 'ID!'],
    ]);
    expect(
      queryFields.adminUsers.args.map((a) => [a.name, String(a.type), a.defaultValue]),
    ).toEqual([
      ['page', 'Int!', 1],
      ['pageSize', 'Int!', 20],
      ['search', 'String', undefined],
    ]);
    expect(names('AdminUserSummary').sort()).toEqual(fields.split(' ').sort());
    expect(names('AdminUserDetail').sort()).toEqual([...fields.split(' '), 'activity'].sort());
    expect(names('AdminUserActivity').sort()).toEqual(
      ['activeVehiclesCount', 'deletedVehiclesCount', 'totalMaintenanceEventsCount'].sort(),
    );
    expect(
      Object.keys(schema.getMutationType()!.getFields()).filter((name) => name.startsWith('admin')),
    ).toEqual([]);
    for (const field of [
      'passwordHash',
      'actionTokens { id }',
      'vehicles { id }',
      'licensePlate',
      'maintenanceEvents { id }',
    ])
      expect(
        (await gql(`query { adminUser(id: "${userId}") { ${field} } }`)).body.errors[0].extensions
          .code,
      ).toBe('VALIDATION_ERROR');
    expect(
      (await gql(`query { adminDashboard(userId: "${adminId}") { totalUsers } }`, {}, userId)).body
        .errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
  });
});
