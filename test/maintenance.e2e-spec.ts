import { buildClientSchema, getIntrospectionQuery, printSchema } from 'graphql';
import { Test } from '@nestjs/testing';
import { type INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { MaintenanceModule } from '../dist/maintenance/maintenance.module.js';
import { VehiclesModule } from '../dist/vehicles/vehicles.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { Prisma } from '../dist/generated/prisma/client.js';
import { MailService } from '../dist/mail/mail.service.js';
import { formatGraphqlError } from '../dist/common/graphql-errors.js';
import type { MaintenanceEvent } from '../src/generated/prisma/client.js';

const secret = 'test-only-secret-with-at-least-32-characters';
const owner = randomUUID();
const other = randomUUID();
const vehicleId = randomUUID();
const categoryId = randomUUID();
const categories = ['MAINTENANCE', 'REPLACEMENT', 'REPAIR', 'PAYMENT', 'INSPECTION', 'OTHER'].map(
  (name, index) => ({ id: index === 0 ? categoryId : randomUUID(), name }),
);
const fields =
  'id vehicleId categoryId name status scheduledDate scheduledOdometerKm executionDate odometerKm cost provider notes createdAt updatedAt';
const create = `mutation($input: CreateMaintenanceEventInput!) { createMaintenanceEvent(input: $input) { event { ${fields} } nextScheduledEvent { ${fields} } } }`;
const update = `mutation($id: ID!, $input: UpdateMaintenanceEventInput!) { updateMaintenanceEvent(id: $id, input: $input) { event { ${fields} } nextScheduledEvent { ${fields} } } }`;
const remove = 'mutation DeleteMaintenanceEvent($id: ID!) { deleteMaintenanceEvent(id: $id) }';
const get = `query($id: ID!) { maintenanceEvent(id: $id) { ${fields} } }`;
const list = `query($vehicleId: ID!, $status: MaintenanceEventStatus) { maintenanceEvents(vehicleId: $vehicleId, status: $status) { ${fields} } }`;
const categoryQuery = 'query { categories { id code } }';
const mileageQuery = 'query($id: ID!) { vehicle(id: $id) { latestOdometerKm } }';
const scheduled = {
  vehicleId,
  categoryId,
  name: '  Oil   Change ',
  status: 'SCHEDULED',
  scheduledDate: '2020-01-01',
};
const executed = {
  vehicleId,
  categoryId,
  name: 'Oil Change',
  status: 'EXECUTED',
  executionDate: '2020-02-01',
};
const next = { name: '  Next   Oil ', categoryId, scheduledOdometerKm: 15000 };

describe('Maintenance GraphQL', () => {
  let app: INestApplication<App>;
  let rows: MaintenanceEvent[] = [];
  let failCreateAt = 0;
  let createCount = 0;
  let failRead = false;
  const vehicles = [
    { id: vehicleId, userId: owner },
    { id: randomUUID(), userId: other },
  ];
  const owned = (id: string, userId: string) =>
    vehicles.some((v) => v.id === id && v.userId === userId);
  const prisma = {
    category: {
      findMany: vi.fn(() =>
        Promise.resolve([...categories].sort((a, b) => a.name.localeCompare(b.name))),
      ),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(categories.find((c) => c.id === where.id) ?? null),
      ),
    },
    vehicle: {
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        if (!owned(where.id, where.userId)) return Promise.resolve(null);
        const readings = rows
          .filter(
            (e) =>
              e.vehicleId === where.id &&
              e.status === 'COMPLETED' &&
              e.odometerKm !== null &&
              e.executionDate !== null,
          )
          .sort(
            (a, b) =>
              (b.executionDate?.getTime() ?? 0) - (a.executionDate?.getTime() ?? 0) ||
              b.id.localeCompare(a.id),
          )
          .slice(0, 1);
        return Promise.resolve({ id: where.id, maintenanceEvents: readings });
      }),
    },
    maintenanceEvent: {
      findFirst: vi.fn(({ where }: { where: { id: string; vehicle: { userId: string } } }) => {
        if (failRead) throw new Error('private database failure');
        return Promise.resolve(
          rows.find((e) => e.id === where.id && owned(e.vehicleId, where.vehicle.userId)) ?? null,
        );
      }),
      findMany: vi.fn(
        ({
          where,
        }: {
          where: { vehicleId: string; vehicle: { userId: string }; status: string };
        }) => {
          const dateField = where.status === 'SCHEDULED' ? 'scheduledDate' : 'executionDate';
          const direction = where.status === 'SCHEDULED' ? 1 : -1;
          return Promise.resolve(
            rows
              .filter(
                (e) =>
                  e.vehicleId === where.vehicleId &&
                  e.status === where.status &&
                  owned(e.vehicleId, where.vehicle.userId),
              )
              .sort((a, b) => {
                const x = a[dateField];
                const y = b[dateField];
                if (x === null && y !== null) return 1;
                if (x !== null && y === null) return -1;
                return (
                  direction * ((x?.getTime() ?? 0) - (y?.getTime() ?? 0)) ||
                  a.id.localeCompare(b.id)
                );
              }),
          );
        },
      ),
      create: vi.fn(({ data }: { data: Prisma.MaintenanceEventUncheckedCreateInput }) => {
        createCount++;
        if (failCreateAt === createCount) throw new Error('private write failure');
        const row = {
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          scheduledDate: null,
          scheduledOdometerKm: null,
          executionDate: null,
          odometerKm: null,
          cost: null,
          provider: null,
          notes: null,
          ...data,
        } as MaintenanceEvent;
        rows.push(row);
        return Promise.resolve(row);
      }),
      delete: vi.fn(({ where }: { where: { id: string; vehicle: { userId: string } } }) => {
        const index = rows.findIndex(
          (e) => e.id === where.id && owned(e.vehicleId, where.vehicle.userId),
        );
        if (index < 0)
          throw new Prisma.PrismaClientKnownRequestError('private', {
            code: 'P2025',
            clientVersion: '7',
          });
        const [row] = rows.splice(index, 1);
        return Promise.resolve(row);
      }),
      update: vi.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; vehicle: { userId: string }; status: string };
          data: Partial<MaintenanceEvent>;
        }) => {
          const row = rows.find(
            (e) =>
              e.id === where.id &&
              e.status === where.status &&
              owned(e.vehicleId, where.vehicle.userId),
          );
          if (!row)
            throw new Prisma.PrismaClientKnownRequestError('private', {
              code: 'P2025',
              clientVersion: '7',
            });
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    },
    // Simulate atomic rollback, preserving Decimal/Date instances in the snapshot.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = rows.map((row) => ({ ...row }));
      try {
        return await fn(prisma);
      } catch (error) {
        rows = snapshot;
        throw error;
      }
    }),
  };
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
  async function createEvent(input: Record<string, unknown> = scheduled) {
    const result = await gql(create, { input });
    expect(result.body.errors).toBeUndefined();
    return result.body.data.createMaintenanceEvent;
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
        MaintenanceModule,
        VehiclesModule,
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
    rows = [];
    failCreateAt = 0;
    createCount = 0;
    failRead = false;
    vi.clearAllMocks();
  });

  it('permanently deletes only the requested event, preserves follow-ups and derives mileage', async () => {
    const older = await createEvent({
      ...executed,
      executionDate: '2020-01-01',
      odometerKm: 150000,
    });
    const latest = await createEvent({
      ...executed,
      executionDate: '2020-06-01',
      odometerKm: 155000,
      nextScheduledEvent: next,
    });
    const remaining = rows.filter((row) => row.id !== latest.event.id).map((row) => ({ ...row }));
    expect((await gql(mileageQuery, { id: vehicleId })).body.data.vehicle.latestOdometerKm).toBe(
      155000,
    );
    expect((await gql(remove, { id: latest.event.id })).body.data.deleteMaintenanceEvent).toBe(
      true,
    );
    expect(rows).toEqual(remaining);
    expect(rows.some((row) => row.id === latest.nextScheduledEvent.id)).toBe(true);
    expect((await gql(get, { id: latest.event.id })).body.errors[0].extensions.code).toBe(
      'MAINTENANCE_EVENT_NOT_FOUND',
    );
    expect((await gql(mileageQuery, { id: vehicleId })).body.data.vehicle.latestOdometerKm).toBe(
      150000,
    );
    await gql(remove, { id: older.event.id });
    expect(
      (await gql(mileageQuery, { id: vehicleId })).body.data.vehicle.latestOdometerKm,
    ).toBeNull();
    await gql(remove, { id: latest.nextScheduledEvent.id });
    expect(rows).toHaveLength(0);
  });
  it('rejects unauthenticated, inaccessible, nonexistent and invalid deletion IDs', async () => {
    const { event } = await createEvent();
    expect((await gql(remove, { id: event.id }, null)).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    const inaccessible = await gql(remove, { id: event.id }, other);
    const absent = await gql(remove, { id: randomUUID() });
    expect(inaccessible.body.errors[0]).toEqual(absent.body.errors[0]);
    expect(absent.body.errors[0].extensions.code).toBe('MAINTENANCE_EVENT_NOT_FOUND');
    expect((await gql(remove, { id: 'invalid' })).body.errors[0].extensions.code).toBe(
      'VALIDATION_ERROR',
    );
    expect(rows).toHaveLength(1);
    expect(prisma.maintenanceEvent.delete).not.toHaveBeenCalled();
  });
  it.each(['P2025', 'P2003'])(
    'handles deletion database failure %s without exposing details',
    async (code) => {
      const { event } = await createEvent();
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      prisma.maintenanceEvent.delete.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('private database details', {
          code,
          clientVersion: '7',
        }),
      );
      try {
        const result = await gql(remove, { id: event.id });
        expect(result.body.errors[0].extensions.code).toBe(
          code === 'P2025' ? 'MAINTENANCE_EVENT_NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
        );
        expect(JSON.stringify(result.body)).not.toContain('private');
        expect(rows).toHaveLength(1);
      } finally {
        log.mockRestore();
      }
    },
  );
  it('retrieves the six existing category codes in deterministic order', async () => {
    const result = await gql(categoryQuery);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.categories.map((c: { code: string }) => c.code)).toEqual([
      'INSPECTION',
      'MAINTENANCE',
      'OTHER',
      'PAYMENT',
      'REPAIR',
      'REPLACEMENT',
    ]);
    expect(
      result.body.data.categories.find((c: { code: string }) => c.code === 'MAINTENANCE').id,
    ).toBe(categoryId);
  });
  it.each([
    { scheduledDate: '2020-01-01', scheduledOdometerKm: null },
    { scheduledDate: null, scheduledOdometerKm: 0 },
    { scheduledDate: '2020-01-01', scheduledOdometerKm: 12000 },
    { scheduledDate: new Date().toISOString().slice(0, 10), scheduledOdometerKm: null },
  ])('creates scheduled events %j', async (patch) => {
    const result = await createEvent({ ...scheduled, ...patch });
    expect(result.event).toMatchObject({
      name: 'Oil Change',
      status: 'SCHEDULED',
      executionDate: null,
      odometerKm: null,
      cost: null,
      provider: null,
    });
    expect(result.nextScheduledEvent).toBeNull();
  });
  it('creates executed events, normalizes optional strings and exposes exact cost', async () => {
    const result = await gql(create, {
      input: {
        ...executed,
        name: ' Oil   Change ',
        odometerKm: 123,
        cost: '12.50',
        provider: '  My   Garage ',
        notes: '  line one\n  line two  ',
      },
    });
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.createMaintenanceEvent).toMatchObject({
      event: {
        name: 'Oil Change',
        status: 'EXECUTED',
        scheduledDate: null,
        scheduledOdometerKm: null,
        executionDate: '2020-02-01T00:00:00.000Z',
        cost: '12.50',
        provider: 'My   Garage',
        notes: 'line one\n  line two',
      },
      nextScheduledEvent: null,
    });
    expect(rows[0].status).toBe('COMPLETED');
  });
  it.each([
    { scheduledDate: null },
    { name: ' ' },
    { categoryId: randomUUID() },
    { categoryId: 'invalid' },
    { scheduledDate: '2023-02-29' },
    { scheduledDate: '2020-02-30' },
    { scheduledOdometerKm: -1 },
    { scheduledOdometerKm: 1.5 },
    { executionDate: '2020-01-01' },
    { odometerKm: 0 },
    { cost: '0.00' },
    { provider: 'Workshop' },
    { userId: other },
    { name: 'x'.repeat(201) },
    { notes: 'x'.repeat(10001) },
  ])('rejects invalid scheduled creation %j', async (patch) => {
    expect(
      (await gql(create, { input: { ...scheduled, ...patch } })).body.errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
    expect(rows).toHaveLength(0);
  });
  it.each([
    { executionDate: null },
    { executionDate: '9999-01-01' },
    { executionDate: 'invalid' },
    { odometerKm: -1 },
    { odometerKm: 1.5 },
    { cost: '-1' },
    { cost: '0.001' },
    { cost: '10000000000.00' },
    { provider: 'x'.repeat(201) },
  ])('rejects invalid executed creation %j', async (patch) => {
    expect(
      (await gql(create, { input: { ...executed, ...patch } })).body.errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
    expect(rows).toHaveLength(0);
  });
  it('filters and retrieves events with chronological ordering and mileage-only entries last', async () => {
    const a = await createEvent({ ...scheduled, scheduledDate: '2022-01-01' });
    const b = await createEvent({ ...scheduled, scheduledDate: '2021-01-01' });
    const c = (
      await gql(create, {
        input: { ...scheduled, scheduledDate: null, scheduledOdometerKm: 12000 },
      })
    ).body.data.createMaintenanceEvent;
    const d = (await gql(create, { input: { ...executed, executionDate: '2021-01-01' } })).body.data
      .createMaintenanceEvent;
    const e = (await gql(create, { input: executed })).body.data.createMaintenanceEvent;
    expect(
      (await gql(list, { vehicleId, status: 'SCHEDULED' })).body.data.maintenanceEvents.map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual([b.event.id, a.event.id, c.event.id]);
    expect(
      (await gql(list, { vehicleId, status: 'EXECUTED' })).body.data.maintenanceEvents.map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual([d.event.id, e.event.id]);
    expect((await gql(list, { vehicleId })).body.data.maintenanceEvents).toHaveLength(5);
    expect((await gql(get, { id: a.event.id })).body.data.maintenanceEvent).toEqual(a.event);
    expect(prisma.maintenanceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ scheduledDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      }),
    );
  });
  it('orders equal dates by ID deterministically', async () => {
    await createEvent();
    await createEvent();
    const expected = rows.map((r) => r.id).sort();
    expect(
      (await gql(list, { vehicleId, status: 'SCHEDULED' })).body.data.maintenanceEvents.map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual(expected);
  });
  it('enforces vehicle and event ownership with safe not-found responses', async () => {
    const { event } = await createEvent();
    for (const user of [other]) {
      expect((await gql(create, { input: scheduled }, user)).body.errors[0].extensions.code).toBe(
        'VEHICLE_NOT_FOUND',
      );
      expect((await gql(list, { vehicleId }, user)).body.errors[0].extensions.code).toBe(
        'VEHICLE_NOT_FOUND',
      );
      for (const id of [event.id, randomUUID()]) {
        expect((await gql(get, { id }, user)).body.errors[0]).toMatchObject({
          message: 'Maintenance event not found.',
          extensions: { code: 'MAINTENANCE_EVENT_NOT_FOUND' },
        });
        expect(
          (
            await gql(
              update,
              {
                id,
                input: {
                  status: 'EXECUTED',
                  executionDate: '2020-02-01',
                  nextScheduledEvent: next,
                },
              },
              user,
            )
          ).body.errors[0].extensions.code,
        ).toBe('MAINTENANCE_EVENT_NOT_FOUND');
      }
    }
    expect(rows).toHaveLength(1);
    expect(
      (await gql(create, { input: { ...scheduled, vehicleId: randomUUID() } })).body.errors[0]
        .extensions.code,
    ).toBe('VEHICLE_NOT_FOUND');
    expect((await gql(get, { id: randomUUID() })).body.errors[0].extensions.code).toBe(
      'MAINTENANCE_EVENT_NOT_FOUND',
    );
  });
  it.each([categoryQuery, create, update, get, list])(
    'requires JWT authentication for %s',
    async (query) => {
      const input = query === update ? {} : scheduled;
      expect(
        (await gql(query, { input, id: randomUUID(), vehicleId }, null)).body.errors[0].extensions
          .code,
      ).toBe('UNAUTHENTICATED');
    },
  );
  it('updates common and scheduling fields, preserves omissions and clears explicit null', async () => {
    const result = await gql(create, {
      input: { ...scheduled, scheduledOdometerKm: 1200, notes: 'existing' },
    });
    const id = result.body.data.createMaintenanceEvent.event.id;
    const changed = await gql(update, {
      id,
      input: {
        name: '  New   Name ',
        categoryId: categories[1].id,
        scheduledDate: null,
        notes: null,
      },
    });
    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.updateMaintenanceEvent).toMatchObject({
      event: {
        name: 'New Name',
        categoryId: categories[1].id,
        scheduledDate: null,
        scheduledOdometerKm: 1200,
        notes: null,
      },
      nextScheduledEvent: null,
    });
    expect(rows).toHaveLength(1);
    expect(
      (await gql(update, { id, input: { scheduledOdometerKm: null } })).body.errors[0].extensions
        .code,
    ).toBe('VALIDATION_ERROR');
    expect(
      (await gql(update, { id, input: { scheduledOdometerKm: 1500 } })).body.data
        .updateMaintenanceEvent.event.scheduledOdometerKm,
    ).toBe(1500);
    expect(
      (await gql(update, { id, input: { scheduledDate: '2024-01-01' } })).body.data
        .updateMaintenanceEvent.event.scheduledDate,
    ).toBe('2024-01-01T00:00:00.000Z');
  });
  it.each([false, true])(
    'completes scheduled events with optional rescheduling=%s and retains history',
    async (reschedule) => {
      const { event } = await createEvent();
      const result = await gql(update, {
        id: event.id,
        input: {
          status: 'EXECUTED',
          executionDate: '2020-02-01',
          odometerKm: 1500,
          cost: '10',
          provider: ' Garage ',
          ...(reschedule ? { nextScheduledEvent: next } : {}),
        },
      });
      expect(result.body.errors).toBeUndefined();
      const payload = result.body.data.updateMaintenanceEvent;
      expect(payload.event).toMatchObject({
        status: 'EXECUTED',
        scheduledDate: event.scheduledDate,
        odometerKm: 1500,
        cost: '10.00',
        provider: 'Garage',
      });
      expect(rows).toHaveLength(reschedule ? 2 : 1);
      if (reschedule)
        expect(payload.nextScheduledEvent).toMatchObject({
          vehicleId,
          name: 'Next Oil',
          status: 'SCHEDULED',
          scheduledOdometerKm: 15000,
          executionDate: null,
        });
      else expect(payload.nextScheduledEvent).toBeNull();
      expect(
        (await gql(update, { id: event.id, input: { status: 'SCHEDULED' } })).body.errors[0]
          .extensions.code,
      ).toBe('VALIDATION_ERROR');
      const ordinary = await gql(update, {
        id: event.id,
        input: { cost: null, provider: null, odometerKm: null },
      });
      expect(ordinary.body.data.updateMaintenanceEvent).toMatchObject({
        event: { cost: null, provider: null, odometerKm: null },
        nextScheduledEvent: null,
      });
      expect(rows).toHaveLength(reschedule ? 2 : 1);
    },
  );
  it('creates executed and next scheduled records together on the same vehicle', async () => {
    const result = await gql(create, {
      input: {
        ...executed,
        nextScheduledEvent: { ...next, scheduledDate: '2021-01-01', notes: ' next ' },
      },
    });
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.createMaintenanceEvent.nextScheduledEvent).toMatchObject({
      vehicleId,
      status: 'SCHEDULED',
      scheduledDate: '2021-01-01T00:00:00.000Z',
      notes: 'next',
      executionDate: null,
      odometerKm: null,
      cost: null,
      provider: null,
    });
    expect(rows).toHaveLength(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...next, name: ' ' },
    { ...next, categoryId: randomUUID() },
    { ...next, scheduledOdometerKm: null },
    { ...next, scheduledDate: '2020-02-30' },
    { ...next, scheduledOdometerKm: -1 },
    { ...next, notes: 'x'.repeat(10001) },
    { ...next, vehicleId: vehicles[1].id },
    { ...next, userId: other },
  ])('rejects invalid rescheduling %j atomically', async (nextScheduledEvent) => {
    expect(
      (await gql(create, { input: { ...executed, nextScheduledEvent } })).body.errors[0].extensions
        .code,
    ).toBe('VALIDATION_ERROR');
    expect(rows).toHaveLength(0);
    const { event } = await createEvent();
    expect(
      (
        await gql(update, {
          id: event.id,
          input: { status: 'EXECUTED', executionDate: '2020-02-01', nextScheduledEvent },
        })
      ).body.errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SCHEDULED');
  });
  it('rejects rescheduling unless the resulting main event is executed', async () => {
    expect(
      (await gql(create, { input: { ...scheduled, nextScheduledEvent: next } })).body.errors[0]
        .extensions.code,
    ).toBe('VALIDATION_ERROR');
    const { event } = await createEvent();
    expect(
      (await gql(update, { id: event.id, input: { nextScheduledEvent: next } })).body.errors[0]
        .extensions.code,
    ).toBe('VALIDATION_ERROR');
    expect(rows).toHaveLength(1);
  });
  it.each(['create', 'update'])(
    'rolls back %s when the next insert fails and conceals database details',
    async (operation) => {
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      try {
        let result;
        if (operation === 'create') {
          failCreateAt = 2;
          result = await gql(create, { input: { ...executed, nextScheduledEvent: next } });
          expect(rows).toHaveLength(0);
        } else {
          const { event } = await createEvent();
          failCreateAt = 2;
          result = await gql(update, {
            id: event.id,
            input: { status: 'EXECUTED', executionDate: '2020-02-01', nextScheduledEvent: next },
          });
          expect(rows).toHaveLength(1);
          expect(rows[0].status).toBe('SCHEDULED');
          expect(rows[0].executionDate).toBeNull();
        }
        expect(result.body.errors[0]).toMatchObject({
          message: 'An unexpected error occurred.',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
        expect(JSON.stringify(result.body)).not.toContain('private');
      } finally {
        log.mockRestore();
      }
    },
  );
  it('updates existing vehicle mileage after execution and ignores planned mileage', async () => {
    const result = await gql(create, { input: { ...scheduled, scheduledOdometerKm: 99999 } });
    const id = result.body.data.createMaintenanceEvent.event.id;
    expect(
      (await gql(mileageQuery, { id: vehicleId })).body.data.vehicle.latestOdometerKm,
    ).toBeNull();
    await gql(update, {
      id,
      input: { status: 'EXECUTED', executionDate: '2020-02-01', odometerKm: 1200 },
    });
    expect((await gql(mileageQuery, { id: vehicleId })).body.data.vehicle.latestOdometerKm).toBe(
      1200,
    );
    await gql(create, { input: { ...executed, executionDate: '2021-01-01', odometerKm: 1800 } });
    expect((await gql(mileageQuery, { id: vehicleId })).body.data.vehicle.latestOdometerKm).toBe(
      1800,
    );
    await gql(update, { id: rows[1].id, input: { odometerKm: 1900 } });
    expect((await gql(mileageQuery, { id: vehicleId })).body.data.vehicle.latestOdometerKm).toBe(
      1900,
    );
  });
  it.each([
    { name: null },
    { categoryId: null },
    { status: null },
    { vehicleId },
    { id: randomUUID() },
    { createdAt: '2020-01-01' },
    { updatedAt: '2020-01-01' },
  ])('rejects invalid update fields %j', async (input) => {
    const { event } = await createEvent();
    expect((await gql(update, { id: event.id, input })).body.errors[0].extensions.code).toBe(
      'VALIDATION_ERROR',
    );
  });
  it('masks read failures and checks the generated schema contract', async () => {
    const result = await gql(getIntrospectionQuery());
    const schema = buildClientSchema(result.body.data);
    const printed = printSchema(schema);
    expect(printed).toContain('enum MaintenanceEventStatus {\n  SCHEDULED\n  EXECUTED\n}');
    expect(printed).toContain('cost: String');
    for (const name of ['UpdateMaintenanceEventInput', 'NextScheduledEventInput']) {
      const type = schema.getType(name);
      const names = type && 'getFields' in type ? Object.keys(type.getFields()) : [];
      for (const forbidden of ['vehicleId', 'userId', 'id', 'createdAt', 'updatedAt'])
        expect(names).not.toContain(forbidden);
    }
    expect(Object.keys(schema.getQueryType()!.getFields())).toEqual(
      expect.arrayContaining(['categories', 'maintenanceEvents', 'maintenanceEvent']),
    );
    expect(Object.keys(schema.getMutationType()!.getFields())).toEqual(
      expect.arrayContaining([
        'createMaintenanceEvent',
        'updateMaintenanceEvent',
        'deleteMaintenanceEvent',
      ]),
    );
    const deletion = schema.getMutationType()!.getFields().deleteMaintenanceEvent;
    expect(String(deletion.type)).toBe('Boolean!');
    expect(deletion.args.map((arg) => [arg.name, String(arg.type)])).toEqual([['id', 'ID!']]);
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    try {
      failRead = true;
      expect((await gql(get, { id: randomUUID() })).body.errors[0].extensions.code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
    } finally {
      log.mockRestore();
    }
  });
});
