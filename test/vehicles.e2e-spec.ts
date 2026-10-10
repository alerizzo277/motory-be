import { buildClientSchema, getIntrospectionQuery } from 'graphql';
import { FUEL_TYPES } from '../src/vehicles/fuel-types.js';
import { Test } from '@nestjs/testing';
import { type INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { VehiclesModule } from '../dist/vehicles/vehicles.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { Prisma } from '../dist/generated/prisma/client.js';
import { MailService } from '../dist/mail/mail.service.js';
import { formatGraphqlError } from '../dist/common/graphql-errors.js';
import type { Vehicle } from '../src/generated/prisma/client.js';

const secret = 'test-only-secret-with-at-least-32-characters';
const owner = randomUUID();
const other = randomUUID();
const fields = 'id brand model year licensePlate fuelType latestOdometerKm createdAt updatedAt';
const create = `mutation($input: CreateVehicleInput!) { createVehicle(input: $input) { ${fields} } }`;
const update = `mutation($id: ID!, $input: UpdateVehicleInput!) { updateVehicle(id: $id, input: $input) { ${fields} } }`;
const get = `query($id: ID!) { vehicle(id: $id) { ${fields} } }`;
const list = `query { vehicles { ${fields} } }`;
const input = {
  brand: '  Alfa   Romeo ',
  model: ' Golf   GTI ',
  year: 2020,
  licensePlate: ' ab 123-cd ',
};
type Event = {
  id: string;
  status: string;
  executionDate: Date | null;
  odometerKm: number | null;
  scheduledOdometerKm?: number;
};
describe('Vehicles GraphQL', () => {
  let app: INestApplication<App>;
  let rows: Vehicle[] = [];
  let events: Event[] = [];
  let fail = false;
  const project = (row: Vehicle) => ({
    ...row,
    maintenanceEvents: events
      .filter((e) => e.status === 'COMPLETED' && e.odometerKm !== null && e.executionDate !== null)
      .sort(
        (a, b) =>
          (b.executionDate?.getTime() ?? 0) - (a.executionDate?.getTime() ?? 0) ||
          b.id.localeCompare(a.id),
      )
      .slice(0, 1),
  });
  const prisma = {
    vehicle: {
      create: vi.fn(({ data }: { data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'> }) => {
        if (fail) throw new Error('private database detail');
        const row = { ...data, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() };
        rows.push(row);
        return Promise.resolve(project(row));
      }),
      findMany: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(rows.filter((r) => r.userId === where.userId).map(project)),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; userId: string } }) => {
        const row = rows.find((r) => r.id === where.id && r.userId === where.userId);
        return Promise.resolve(row ? project(row) : null);
      }),
      update: vi.fn(
        ({ where, data }: { where: { id: string; userId: string }; data: Partial<Vehicle> }) => {
          const row = rows.find((r) => r.id === where.id && r.userId === where.userId);
          if (!row)
            throw new Prisma.PrismaClientKnownRequestError('private', {
              code: 'P2025',
              clientVersion: '7',
            });
          Object.assign(
            row,
            Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
          );
          return Promise.resolve(project(row));
        },
      ),
    },
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
    events = [];
    fail = false;
  });
  it('creates normalized vehicles with optional fuel and preserves capitalization and separators', async () => {
    const { body } = await gql(create, { input });
    expect(body.errors).toBeUndefined();
    expect(body.data.createVehicle).toMatchObject({
      brand: 'Alfa Romeo',
      model: 'Golf GTI',
      licensePlate: 'AB 123-CD',
      fuelType: null,
      latestOdometerKm: null,
    });
    expect(rows[0]?.userId).toBe(owner);
    expect(
      (await gql(create, { input: { ...input, brand: ' bmw ', fuelType: 'ELECTRIC' } })).body.data
        .createVehicle,
    ).toMatchObject({ brand: 'bmw', fuelType: 'ELECTRIC' });
  });
  it.each([
    { brand: ' ' },
    { model: ' ' },
    { licensePlate: ' ' },
    { year: 1885 },
    { year: new Date().getFullYear() + 1 },
    { year: 2020.5 },
    { fuelType: 'INVALID' },
    { brand: null },
    { userId: other },
  ])('rejects invalid creation %j', async (patch) => {
    expect(
      (await gql(create, { input: { ...input, ...patch } })).body.errors[0].extensions.code,
    ).toBe('VALIDATION_ERROR');
    expect(rows).toHaveLength(0);
  });
  it.each(FUEL_TYPES)('accepts supported fuel %s', async (fuelType) => {
    expect(
      (await gql(create, { input: { ...input, fuelType } })).body.data.createVehicle.fuelType,
    ).toBe(fuelType);
  });
  it('keeps the schema limited to vehicle operations and permitted fields', async () => {
    const result = await gql(getIntrospectionQuery());
    const schema = buildClientSchema(result.body.data);
    expect(Object.keys(schema.getQueryType()!.getFields())).toEqual(
      expect.arrayContaining(['vehicles', 'vehicle']),
    );
    expect(Object.keys(schema.getMutationType()!.getFields())).toEqual(
      expect.arrayContaining(['createVehicle', 'updateVehicle']),
    );
    for (const name of ['CreateVehicleInput', 'UpdateVehicleInput']) {
      const type = schema.getType(name);
      expect(type && 'getFields' in type ? Object.keys(type.getFields()) : []).toEqual([
        'brand',
        'model',
        'year',
        'licensePlate',
        'fuelType',
      ]);
    }
    const type = schema.getType('Vehicle');
    expect(type && 'getFields' in type ? Object.keys(type.getFields()) : []).toEqual([
      'id',
      'brand',
      'model',
      'year',
      'licensePlate',
      'fuelType',
      'createdAt',
      'updatedAt',
      'latestOdometerKm',
    ]);
  });
  it('rejects omitted required fields', async () => {
    expect((await gql(create, { input: {} })).body.errors[0].extensions.code).toBe(
      'VALIDATION_ERROR',
    );
  });
  it('lists and retrieves only owned vehicles; conceals inaccessible and missing rows', async () => {
    const id = (await gql(create, { input })).body.data.createVehicle.id;
    await gql(create, { input }, other);
    expect((await gql(list)).body.data.vehicles).toHaveLength(1);
    expect((await gql(get, { id })).body.data.vehicle.id).toBe(id);
    for (const query of [get, update]) {
      for (const [target, user] of [
        [id, other],
        [randomUUID(), owner],
      ]) {
        expect(
          (await gql(query, { id: target, input: {} }, user)).body.errors[0].extensions.code,
        ).toBe('VEHICLE_NOT_FOUND');
      }
    }
  });
  it('updates supplied values, preserves omissions, clears fuel and rejects null required values', async () => {
    const id = (await gql(create, { input: { ...input, fuelType: 'DIESEL' } })).body.data
      .createVehicle.id;
    const result = await gql(update, { id, input: { model: '  Fiesta   ST ', fuelType: null } });
    expect(result.body.data.updateVehicle).toMatchObject({
      brand: 'Alfa Romeo',
      model: 'Fiesta ST',
      fuelType: null,
    });
    for (const patch of [
      { brand: null },
      { model: ' ' },
      { fuelType: 'bad' },
      { year: 1880 },
      { licensePlate: null },
      { id: randomUUID() },
    ]) {
      expect((await gql(update, { id, input: patch })).body.errors[0].extensions.code).toBe(
        'VALIDATION_ERROR',
      );
    }
  });
  it.each([create, update, get, list])('requires authentication for %s', async (query) => {
    expect(
      (await gql(query, { input, id: randomUUID() }, null)).body.errors[0].extensions.code,
    ).toBe('UNAUTHENTICATED');
  });
  it('returns chronological mileage with deterministic ties and ignores scheduled or incomplete readings', async () => {
    const id = (await gql(create, { input })).body.data.createVehicle.id;
    events = [
      { id: 'a', status: 'COMPLETED', executionDate: new Date('2020-01-01'), odometerKm: 90000 },
      { id: 'a', status: 'COMPLETED', executionDate: new Date('2021-01-01'), odometerKm: 5000 },
      { id: 'b', status: 'COMPLETED', executionDate: new Date('2021-01-01'), odometerKm: 6000 },
      {
        id: 'c',
        status: 'SCHEDULED',
        executionDate: new Date('2022-01-01'),
        odometerKm: 10000,
        scheduledOdometerKm: 20000,
      },
      { id: 'd', status: 'COMPLETED', executionDate: new Date('2023-01-01'), odometerKm: null },
      { id: 'e', status: 'COMPLETED', executionDate: null, odometerKm: 99999 },
    ];
    expect((await gql(get, { id })).body.data.vehicle.latestOdometerKm).toBe(6000);
    expect((await gql(list)).body.data.vehicles[0].latestOdometerKm).toBe(6000);
    expect((await gql(list, {}, other)).body.data.vehicles).toEqual([]);
    events = events.filter((e) => e.status === 'SCHEDULED');
    expect((await gql(get, { id })).body.data.vehicle.latestOdometerKm).toBeNull();
  });
  it('masks unexpected database failures', async () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    fail = true;
    const result = await gql(create, { input });
    expect(result.body.errors[0]).toMatchObject({
      message: 'An unexpected error occurred.',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    expect(JSON.stringify(result.body)).not.toContain('private');
    log.mockRestore();
  });
});
