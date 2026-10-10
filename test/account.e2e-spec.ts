import { Test } from '@nestjs/testing';
import { type INestApplication, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { JwtService } from '@nestjs/jwt';
import { buildClientSchema, getIntrospectionQuery } from 'graphql';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { VehiclesModule } from '../dist/vehicles/vehicles.module.js';
import { MaintenanceModule } from '../dist/maintenance/maintenance.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { Prisma } from '../dist/generated/prisma/client.js';
import { MailService } from '../dist/mail/mail.service.js';
import { formatGraphqlError } from '../dist/common/graphql-errors.js';
import type { User, Vehicle, MaintenanceEvent } from '../src/generated/prisma/client.js';

const secret = 'account-test-secret-with-at-least-32-characters';
const owner = randomUUID();
const other = randomUUID();
const dayMs = 86400000;
const profileFields = 'id firstName lastName email role createdAt updatedAt';
const profile = `mutation($input: UpdateProfileInput!) { updateProfile(input: $input) { ${profileFields} } }`;
const me = `query { me { ${profileFields} } }`;
const deleted =
  'query { deletedVehicles { id brand model year licensePlate deletedAt recoveryDeadline } }';
const restore = 'mutation($id: ID!) { restoreVehicle(id: $id) }';
const missing = () =>
  new Prisma.PrismaClientKnownRequestError('private detail', { code: 'P2025', clientVersion: '7' });
type VehicleWhere = { id?: string; userId: string; deletedAt?: null | { gt: Date } };

describe('Account profile and vehicle recovery GraphQL', () => {
  let app: INestApplication<App>;
  let now: number;
  let rows: Vehicle[];
  let users: (User & { role: { id: string; name: string } })[];
  let events: MaintenanceEvent[];
  let fail: boolean;
  const mail = { sendVehicleDeletionEmail: vi.fn() };
  const matches = (row: Vehicle, where: VehicleWhere) =>
    (!where.id || row.id === where.id) &&
    row.userId === where.userId &&
    (where.deletedAt === undefined ||
      (where.deletedAt === null
        ? row.deletedAt === null
        : row.deletedAt !== null && row.deletedAt > where.deletedAt.gt));
  const project = (row: Vehicle) => ({
    ...row,
    maintenanceEvents: events
      .filter((e) => e.vehicleId === row.id && e.odometerKm !== null)
      .map((e) => ({ odometerKm: e.odometerKm })),
  });
  const prisma = {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users.find((u) => u.id === where.id) ?? null),
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Partial<User> }) => {
        if (fail) throw new Error('private database detail');
        const row = users.find((u) => u.id === where.id);
        if (!row) throw missing();
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    vehicle: {
      findMany: vi.fn(({ where }: { where: VehicleWhere }) => {
        if (fail) throw new Error('private database detail');
        return Promise.resolve(
          rows
            .filter((r) => matches(r, where))
            .sort(
              (a, b) =>
                (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0) ||
                b.id.localeCompare(a.id),
            )
            .map(project),
        );
      }),
      findFirst: vi.fn(({ where }: { where: VehicleWhere }) =>
        Promise.resolve(
          rows.find((r) => matches(r, where))
            ? project(rows.find((r) => matches(r, where))!)
            : null,
        ),
      ),
      update: vi.fn(({ where, data }: { where: VehicleWhere; data: Partial<Vehicle> }) => {
        if (fail) throw new Error('private database detail');
        const row = rows.find((r) => matches(r, where));
        if (!row) throw missing();
        Object.assign(row, data);
        return Promise.resolve(project(row));
      }),
    },
    maintenanceEvent: {
      findFirst: vi.fn(({ where }: { where: { id: string; vehicle: VehicleWhere } }) =>
        Promise.resolve(
          events.find(
            (e) =>
              e.id === where.id &&
              rows.some((v) => v.id === e.vehicleId && matches(v, where.vehicle)),
          ) ?? null,
        ),
      ),
      findMany: vi.fn(
        ({ where }: { where: { vehicleId: string; status: string; vehicle: VehicleWhere } }) =>
          Promise.resolve(
            events.filter(
              (e) =>
                e.vehicleId === where.vehicleId &&
                e.status === where.status &&
                rows.some((v) => v.id === e.vehicleId && matches(v, where.vehicle)),
            ),
          ),
      ),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  function vehicle(deletedAt: Date | null, userId = owner): Vehicle {
    const row = {
      id: randomUUID(),
      userId,
      brand: 'Ford',
      model: 'Focus',
      year: 2020,
      licensePlate: 'AB123CD',
      fuelType: null,
      deletedAt,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
    rows.push(row);
    return row;
  }
  function gql(query: string, variables = {}, userId: string | null = owner) {
    const req = request(app.getHttpServer()).post('/graphql');
    if (userId)
      req.set(
        'Authorization',
        'Bearer ' +
          new JwtService().sign({ sub: userId, role: 'USER' }, { secret, expiresIn: 3600 }),
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
              VEHICLE_DELETION_RETENTION_DAYS: '7',
              JWT_SECRET: secret,
              JWT_EXPIRES_IN: '3600',
              FRONTEND_URL: 'https://example.com',
              EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: '1440',
              PASSWORD_RESET_TOKEN_TTL_MINUTES: '60',
            }),
          ],
        }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          formatError: formatGraphqlError,
          includeStacktraceInErrorResponses: false,
        }),
        VehiclesModule,
        MaintenanceModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    now = Date.now();
    rows = [];
    events = [];
    fail = false;
    vi.clearAllMocks();
    app.get(ConfigService).set('VEHICLE_DELETION_RETENTION_DAYS', '7');
    users = [owner, other].map((id) => ({
      id,
      firstName: 'Alice',
      lastName: 'Rossi',
      email: id + '@example.com',
      passwordHash: 'secret hash',
      roleId: randomUUID(),
      role: { id: randomUUID(), name: 'USER' },
      emailVerifiedAt: new Date(now),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('me reports the persisted role for ordinary and ADMIN users, without trusting JWT role', async () => {
    expect((await gql(me)).body.data.me.role).toBe('USER');
    users[0].role.name = 'ADMIN';
    expect((await gql(me)).body.data.me).toMatchObject({
      role: 'ADMIN',
      email: users[0].email,
      firstName: 'Alice',
      lastName: 'Rossi',
    });
  });
  it.each([{ firstName: '  aLiCe \t Maria  ' }, { lastName: '  De \n Rossi ' }])(
    'updates only current-user names with normalization: %j',
    async (input) => {
      const before = structuredClone(users);
      const result = await gql(profile, { input });
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.updateProfile).toMatchObject({
        firstName: input.firstName ? 'aLiCe Maria' : 'Alice',
        lastName: input.lastName ? 'De Rossi' : 'Rossi',
      });
      expect(users[1]).toEqual(before[1]);
      for (const key of [
        'email',
        'passwordHash',
        'roleId',
        'role',
        'emailVerifiedAt',
        'createdAt',
        'updatedAt',
      ] as const)
        expect(users[0][key]).toEqual(before[0][key]);
    },
  );
  it.each([
    { firstName: ' \t ' },
    { lastName: '' },
    { firstName: null },
    { lastName: null },
    { firstName: 'x'.repeat(101) },
    { email: 'new@example.com' },
    { roles: ['ADMIN'] },
    { role: 'ADMIN' },
    { userId: other },
    { passwordHash: 'new' },
    { createdAt: '2020-01-01' },
    { emailVerifiedAt: null },
  ])('rejects invalid or readonly profile input %j', async (input) => {
    expect((await gql(profile, { input })).body.errors[0].extensions.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('accepts name length boundaries and omission without clearing the other name', async () => {
    expect(
      (await gql(profile, { input: { firstName: 'A', lastName: 'x'.repeat(100) } })).body.errors,
    ).toBeUndefined();
    expect((await gql(profile, { input: {} })).body.errors).toBeUndefined();
    expect(users[0].firstName).toBe('A');
    expect(users[0].lastName).toHaveLength(100);
  });
  it('lists only owned unexpired deleted vehicles, newest first with a stable ID tie', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vehicle(null);
    vehicle(new Date(now - dayMs), other);
    vehicle(new Date(now - 7 * dayMs));
    vehicle(new Date(now - 7 * dayMs - 1));
    const oldest = vehicle(new Date(now - 7 * dayMs + 1));
    const first = vehicle(new Date(now - dayMs));
    const second = vehicle(new Date(now - dayMs));
    const result = await gql(deleted);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.deletedVehicles.map((v: { id: string }) => v.id)).toEqual(
      [first.id, second.id].sort().reverse().concat(oldest.id),
    );
    expect(
      result.body.data.deletedVehicles.find((v: { id: string }) => v.id === oldest.id)
        .recoveryDeadline,
    ).toBe(new Date(now + 1).toISOString());
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          licensePlate: true,
          deletedAt: true,
        },
      }),
    );
  });
  it('restores the same row and unchanged history, making normal reads accessible again', async () => {
    const row = vehicle(new Date(now - dayMs));
    const event: MaintenanceEvent = {
      id: randomUUID(),
      vehicleId: row.id,
      categoryId: randomUUID(),
      name: 'Oil',
      status: 'COMPLETED',
      executionDate: new Date(now - dayMs),
      odometerKm: 12345,
      scheduledDate: null,
      scheduledOdometerKm: null,
      cost: null,
      provider: null,
      notes: 'History',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
    events.push(event);
    const before = structuredClone(events);
    const original = { ...row };
    const detail = 'query($id: ID!) { vehicle(id: $id) { id latestOdometerKm } }';
    const eventDetail = 'query($id: ID!) { maintenanceEvent(id: $id) { id notes } }';
    expect((await gql(detail, { id: row.id })).body.errors[0].extensions.code).toBe(
      'VEHICLE_NOT_FOUND',
    );
    expect((await gql(eventDetail, { id: event.id })).body.errors[0].extensions.code).toBe(
      'MAINTENANCE_EVENT_NOT_FOUND',
    );
    expect((await gql(restore, { id: row.id })).body).toEqual({ data: { restoreVehicle: true } });
    expect(rows).toEqual([{ ...original, deletedAt: null }]);
    expect(events).toEqual(before);
    expect((await gql(detail, { id: row.id })).body.data.vehicle).toEqual({
      id: row.id,
      latestOdometerKm: 12345,
    });
    expect((await gql(eventDetail, { id: event.id })).body.data.maintenanceEvent.notes).toBe(
      'History',
    );
    expect((await gql('query { vehicles { id } }')).body.data.vehicles).toEqual([{ id: row.id }]);
    expect(
      (await gql('query($id: ID!) { maintenanceEvents(vehicleId: $id) { id } }', { id: row.id }))
        .body.data.maintenanceEvents,
    ).toEqual([{ id: event.id }]);
    expect((await gql(deleted)).body.data.deletedVehicles).toEqual([]);
    expect(mail.sendVehicleDeletionEmail).not.toHaveBeenCalled();
    expect(prisma.maintenanceEvent.update).not.toHaveBeenCalled();
    expect(prisma.maintenanceEvent.create).not.toHaveBeenCalled();
    expect(prisma.maintenanceEvent.delete).not.toHaveBeenCalled();
  });
  it('rejects foreign, active, missing, expired and exactly expired vehicles identically', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const ids = [
      vehicle(null).id,
      vehicle(new Date(now), other).id,
      randomUUID(),
      vehicle(new Date(now - 7 * dayMs - 1)).id,
      vehicle(new Date(now - 7 * dayMs)).id,
    ];
    for (const id of ids)
      expect((await gql(restore, { id })).body.errors[0]).toMatchObject({
        message: 'Vehicle not found.',
        extensions: { code: 'VEHICLE_NOT_FOUND' },
      });
    expect((await gql(restore, { id: 'invalid' })).body.errors[0].extensions.code).toBe(
      'VALIDATION_ERROR',
    );
  });
  it('rechecks eligibility after listing, and uses changed configured retention', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const row = vehicle(new Date(now - 7 * dayMs + 1));
    expect((await gql(deleted)).body.data.deletedVehicles).toHaveLength(1);
    vi.spyOn(Date, 'now').mockReturnValue(now + 1);
    expect((await gql(restore, { id: row.id })).body.errors[0].extensions.code).toBe(
      'VEHICLE_NOT_FOUND',
    );
    app.get(ConfigService).set('VEHICLE_DELETION_RETENTION_DAYS', '8');
    expect((await gql(deleted)).body.data.deletedVehicles[0].recoveryDeadline).toBe(
      new Date(now + dayMs + 1).toISOString(),
    );
    expect((await gql(restore, { id: row.id })).body.data.restoreVehicle).toBe(true);
  });
  it('allows just one winner for simultaneous restoration attempts', async () => {
    const row = vehicle(new Date(now));
    const results = await Promise.all([gql(restore, { id: row.id }), gql(restore, { id: row.id })]);
    expect(results.filter((r) => r.body.data?.restoreVehicle)).toHaveLength(1);
    expect(
      results.filter((r) => r.body.errors?.[0].extensions.code === 'VEHICLE_NOT_FOUND'),
    ).toHaveLength(1);
  });
  it.each([me, profile, deleted, restore])('requires JWT for %s', async (query) => {
    expect(
      (await gql(query, { input: { firstName: 'Alice' }, id: randomUUID() }, null)).body.errors[0]
        .extensions.code,
    ).toBe('UNAUTHENTICATED');
  });
  it.each([profile, deleted, restore])('masks database failures for %s', async (query) => {
    const row = vehicle(new Date(now));
    fail = true;
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const result = await gql(query, { input: { firstName: 'Alice' }, id: row.id });
    expect(result.body.errors[0]).toMatchObject({
      message: 'An unexpected error occurred.',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    expect(JSON.stringify(result.body)).not.toContain('private');
    expect(row.deletedAt).not.toBeNull();
  });
  it('keeps schema narrow, role representation unchanged, and recovery records free of nested data', async () => {
    const schema = buildClientSchema((await gql(getIntrospectionQuery())).body.data);
    const mutation = schema.getMutationType()!.getFields();
    expect(String(mutation.restoreVehicle.type)).toBe('Boolean!');
    expect(mutation.restoreVehicle.args.map((a) => [a.name, String(a.type)])).toEqual([
      ['id', 'ID!'],
    ]);
    expect(String(mutation.updateProfile.type)).toBe('User!');
    expect(String(schema.getQueryType()!.getFields().deletedVehicles.type)).toBe(
      '[DeletedVehicle!]!',
    );
    const input = schema.getType('UpdateProfileInput');
    expect(input && 'getFields' in input ? Object.keys(input.getFields()) : []).toEqual([
      'firstName',
      'lastName',
    ]);
    const type = schema.getType('DeletedVehicle');
    expect(type && 'getFields' in type ? Object.keys(type.getFields()) : []).toEqual([
      'id',
      'brand',
      'model',
      'year',
      'licensePlate',
      'deletedAt',
      'recoveryDeadline',
    ]);
    for (const field of ['maintenanceEvents { id }', 'latestOdometerKm', 'userId'])
      expect(
        (await gql(`query { deletedVehicles { ${field} } }`)).body.errors[0].extensions.code,
      ).toBe('VALIDATION_ERROR');
    for (const field of ['passwordHash', 'emailVerifiedAt', 'actionTokens { id }'])
      expect((await gql(`query { me { ${field} } }`)).body.errors[0].extensions.code).toBe(
        'VALIDATION_ERROR',
      );
  });
});
