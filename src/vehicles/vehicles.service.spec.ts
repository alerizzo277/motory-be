import { VehiclesService } from './vehicles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
const id = 'ac411c10-bbfe-42ef-a999-232163c72a13';
describe('VehiclesService', () => {
  const vehicle = { id, brand: 'Ford', maintenanceEvents: [{ odometerKm: 1200 }] };
  const prisma = {
    vehicle: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const service = new VehiclesService(prisma as unknown as PrismaService);
  beforeEach(() => vi.resetAllMocks());
  it('scopes listing and bounds mileage by chronology rather than maximum reading', async () => {
    prisma.vehicle.findMany.mockResolvedValue([vehicle]);
    expect(await service.list('owner')).toEqual([{ id, brand: 'Ford', latestOdometerKm: 1200 }]);
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: expect.objectContaining({
          maintenanceEvents: {
            where: { status: 'COMPLETED', odometerKm: { not: null }, executionDate: { not: null } },
            orderBy: [{ executionDate: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { odometerKm: true },
          },
        }),
      }),
    );
  });
  it('returns null for missing mileage and checks ownership on retrieval', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ ...vehicle, maintenanceEvents: [] });
    expect(await service.get('owner', id)).toHaveProperty('latestOdometerKm', null);
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, userId: 'owner' } }),
    );
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.get('other', id)).rejects.toMatchObject({
      extensions: { code: 'VEHICLE_NOT_FOUND' },
    });
  });
  it('enforces ownership in the update write and controls missing-row errors', async () => {
    prisma.vehicle.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('private', { code: 'P2025', clientVersion: '7' }),
    );
    await expect(service.update('other', id, { fuelType: null })).rejects.toMatchObject({
      extensions: { code: 'VEHICLE_NOT_FOUND' },
    });
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, userId: 'other' },
        data: expect.objectContaining({ fuelType: null }),
      }),
    );
  });
});
