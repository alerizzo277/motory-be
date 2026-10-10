import { randomUUID } from 'node:crypto';
import { MaintenanceService } from './maintenance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

const vehicleId = randomUUID();
const categoryId = randomUUID();
const id = randomUUID();
const base = {
  vehicleId,
  categoryId,
  name: '  Oil   Change ',
  status: 'SCHEDULED' as const,
  scheduledDate: '2020-01-01',
};
const previous = {
  id,
  vehicleId,
  categoryId,
  name: 'Oil Change',
  status: 'SCHEDULED',
  scheduledDate: new Date('2020-01-01'),
  scheduledOdometerKm: 1000,
  executionDate: null,
  odometerKm: null,
  cost: null,
  provider: null,
  notes: 'history',
  createdAt: new Date(),
  updatedAt: new Date(),
};
describe('MaintenanceService', () => {
  const db = {
    vehicle: { findFirst: vi.fn() },
    category: { findMany: vi.fn(), findUnique: vi.fn() },
    maintenanceEvent: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const transaction = vi.fn(async (fn: (tx: typeof db) => unknown) => fn(db));
  const service = new MaintenanceService({
    ...db,
    $transaction: transaction,
  } as unknown as PrismaService);
  beforeEach(() => {
    vi.clearAllMocks();
    db.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
    db.category.findUnique.mockResolvedValue({ id: categoryId });
    db.maintenanceEvent.findFirst.mockResolvedValue(previous);
    db.maintenanceEvent.create.mockImplementation(({ data }: { data: object }) => ({
      ...previous,
      ...data,
    }));
    db.maintenanceEvent.update.mockImplementation(({ data }: { data: object }) => ({
      ...previous,
      ...data,
    }));
  });
  it('projects category codes with deterministic database ordering', async () => {
    db.category.findMany.mockResolvedValue([{ id: categoryId, name: 'OTHER' }]);
    expect(await service.categories()).toEqual([{ id: categoryId, code: 'OTHER' }]);
    expect(db.category.findMany).toHaveBeenCalledWith({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
  });
  it.each(['SCHEDULED', 'COMPLETED'] as const)('scopes and orders %s lists', async (status) => {
    db.maintenanceEvent.findMany.mockResolvedValue([]);
    await service.list('owner', vehicleId, status);
    expect(db.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: vehicleId, userId: 'owner' },
      select: { id: true },
    });
    expect(db.maintenanceEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vehicleId, vehicle: { userId: 'owner' }, status },
        orderBy: expect.arrayContaining([{ id: 'asc' }]),
      }),
    );
    const order = db.maintenanceEvent.findMany.mock.calls[0][0].orderBy;
    expect(order).toContainEqual(
      status === 'COMPLETED'
        ? { executionDate: { sort: 'desc', nulls: 'last' } }
        : { scheduledDate: { sort: 'asc', nulls: 'last' } },
    );
  });
  it('conceals inaccessible events and vehicles before writing', async () => {
    db.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.create('other', base)).rejects.toMatchObject({
      extensions: { code: 'VEHICLE_NOT_FOUND' },
    });
    await expect(service.list('other', vehicleId)).rejects.toMatchObject({
      extensions: { code: 'VEHICLE_NOT_FOUND' },
    });
    db.maintenanceEvent.findFirst.mockResolvedValue(null);
    await expect(service.get('other', id)).rejects.toMatchObject({
      extensions: { code: 'MAINTENANCE_EVENT_NOT_FOUND' },
    });
    await expect(service.update('other', id, {})).rejects.toMatchObject({
      extensions: { code: 'MAINTENANCE_EVENT_NOT_FOUND' },
    });
    expect(db.maintenanceEvent.create).not.toHaveBeenCalled();
    expect(db.maintenanceEvent.update).not.toHaveBeenCalled();
  });
  it('normalizes text and persists exact monetary values', async () => {
    const result = await service.create('owner', {
      ...base,
      status: 'COMPLETED',
      executionDate: '2020-02-01',
      cost: '1234567890.12',
      provider: '  My   Garage  ',
      notes: '  first\n  second  ',
    });
    expect(result.event).toMatchObject({
      name: 'Oil Change',
      cost: '1234567890.12',
      provider: 'My   Garage',
      notes: 'first\n  second',
    });
    expect(db.maintenanceEvent.create.mock.calls[0][0].data.cost).toBeInstanceOf(Prisma.Decimal);
    expect(result.nextScheduledEvent).toBeNull();
  });
  it('completes with retained scheduling history and creates the requested next event once', async () => {
    const result = await service.update('owner', id, {
      status: 'COMPLETED',
      executionDate: '2020-02-01',
      nextScheduledEvent: { name: 'Next', categoryId, scheduledOdometerKm: 0 },
    });
    expect(result.event).toMatchObject({
      status: 'COMPLETED',
      scheduledDate: previous.scheduledDate,
      scheduledOdometerKm: 1000,
      notes: 'history',
    });
    expect(result.nextScheduledEvent).toMatchObject({
      vehicleId,
      status: 'SCHEDULED',
      scheduledDate: null,
      scheduledOdometerKm: 0,
      executionDate: null,
      cost: null,
      provider: null,
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(db.maintenanceEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, vehicle: { userId: 'owner' }, status: 'SCHEDULED' } }),
    );
    expect(db.maintenanceEvent.create).toHaveBeenCalledTimes(1);
  });
  it('preserves omissions, clears explicit null and does not reschedule an ordinary update', async () => {
    const result = await service.update('owner', id, { scheduledDate: null, notes: null });
    expect(result.event).toMatchObject({
      name: 'Oil Change',
      scheduledDate: null,
      scheduledOdometerKm: 1000,
      notes: null,
    });
    expect(db.maintenanceEvent.create).not.toHaveBeenCalled();
  });
  it('does not rewrite omitted persisted values when updating a different field', async () => {
    const stored = {
      ...previous,
      scheduledDate: new Date('2020-01-01T15:30:00Z'),
      name: 'Existing  name',
    };
    db.maintenanceEvent.findFirst.mockResolvedValue(stored);
    db.maintenanceEvent.update.mockImplementation(({ data }: { data: object }) => ({
      ...stored,
      ...data,
    }));
    const result = await service.update('owner', id, { notes: 'new note' });
    expect(result.event).toMatchObject({ name: stored.name, scheduledDate: stored.scheduledDate });
    expect(db.maintenanceEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notes: 'new note' } }),
    );
  });
  it('rejects reverse status transitions', async () => {
    db.maintenanceEvent.findFirst.mockResolvedValue({
      ...previous,
      status: 'COMPLETED',
      executionDate: new Date('2020-02-01'),
    });
    await expect(service.update('owner', id, { status: 'SCHEDULED' })).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    expect(db.maintenanceEvent.update).not.toHaveBeenCalled();
  });
  it.each([
    { name: ' ' },
    { name: 'x'.repeat(201) },
    { categoryId: 'bad' },
    { scheduledDate: null },
    { scheduledDate: '2023-02-29' },
    { scheduledDate: '2020-13-01' },
    { scheduledDate: '01/01/2020' },
    { scheduledOdometerKm: -1 },
    { scheduledOdometerKm: 1.5 },
    { scheduledOdometerKm: 2147483648 },
    { status: 'COMPLETED' as const },
    { status: 'COMPLETED' as const, executionDate: '9999-01-01' },
    { executionDate: '2020-01-01' },
    { odometerKm: 1 },
    { cost: '0' },
    { provider: 'Garage' },
    { nextScheduledEvent: { name: 'Next', categoryId, scheduledDate: '2021-01-01' } },
  ])('rejects invalid event %j before writing', async (patch) => {
    await expect(service.create('owner', { ...base, ...patch })).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    expect(db.maintenanceEvent.create).not.toHaveBeenCalled();
  });
  it.each(['-1', '1.001', '10000000000', 'NaN', '1e3', ' 1 ', ''])(
    'rejects invalid executed cost %s',
    async (cost) => {
      await expect(
        service.create('owner', {
          ...base,
          status: 'COMPLETED',
          executionDate: '2020-01-01',
          cost,
        }),
      ).rejects.toMatchObject({ extensions: { code: 'VALIDATION_ERROR' } });
    },
  );
  it('rejects missing categories and invalid nested inputs before main writes', async () => {
    db.category.findUnique.mockResolvedValue(null);
    await expect(service.create('owner', base)).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    db.category.findUnique.mockResolvedValue({ id: categoryId });
    await expect(
      service.create('owner', {
        ...base,
        status: 'COMPLETED',
        executionDate: '2020-01-01',
        nextScheduledEvent: { name: 'Next', categoryId },
      }),
    ).rejects.toMatchObject({ extensions: { code: 'VALIDATION_ERROR' } });
    expect(db.maintenanceEvent.create).not.toHaveBeenCalled();
  });
  it('controls disappearing update rows', async () => {
    db.maintenanceEvent.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('private', { code: 'P2025', clientVersion: '7' }),
    );
    await expect(service.update('owner', id, {})).rejects.toMatchObject({
      extensions: { code: 'MAINTENANCE_EVENT_NOT_FOUND' },
    });
  });
});
