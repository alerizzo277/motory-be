import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service.js';
import { VehiclesService } from './vehicles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
const id = 'ac411c10-bbfe-42ef-a999-232163c72a13';
describe('VehiclesService', () => {
  const vehicle = { id, brand: 'Ford', maintenanceEvents: [{ odometerKm: 1200 }] };
  const prisma = {
    vehicle: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const mail = { sendVehicleDeletionEmail: vi.fn() };
  const config = new ConfigService({ VEHICLE_DELETION_RETENTION_DAYS: '37' });
  const service = new VehiclesService(
    prisma as unknown as PrismaService,
    config,
    mail as unknown as MailService,
  );
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  beforeEach(() => vi.resetAllMocks());
  it('soft deletes atomically before sending the configured notification', async () => {
    const information = {
      brand: 'Ford',
      model: 'Fiesta',
      licensePlate: 'AB123CD',
      user: { email: 'owner@example.com' },
    };
    prisma.vehicle.update.mockResolvedValue(information);
    expect(await service.delete('owner', id)).toBe(true);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id, userId: 'owner', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
      select: { brand: true, model: true, licensePlate: true, user: { select: { email: true } } },
    });
    expect(mail.sendVehicleDeletionEmail).toHaveBeenCalledWith(
      'owner@example.com',
      information,
      37,
    );
    expect(prisma.vehicle.update.mock.invocationCallOrder[0]).toBeLessThan(
      mail.sendVehicleDeletionEmail.mock.invocationCallOrder[0],
    );
  });
  it('keeps successful deletion on notification failure and logs without sensitive information', async () => {
    prisma.vehicle.update.mockResolvedValue({
      brand: 'Ford',
      model: 'Fiesta',
      licensePlate: 'AB123CD',
      user: { email: 'owner@example.com' },
    });
    mail.sendVehicleDeletionEmail.mockRejectedValue(new Error('private provider detail'));
    const log = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    expect(await service.delete('owner', id)).toBe(true);
    expect(log).toHaveBeenCalledWith('Vehicle deletion notification could not be delivered');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|owner@example|AB123CD/);
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(1);
  });
  it('does not send a notification for invalid IDs or failed deletion', async () => {
    await expect(service.delete('owner', 'invalid')).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    prisma.vehicle.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('private', { code: 'P2025', clientVersion: '7' }),
    );
    await expect(service.delete('owner', id)).rejects.toMatchObject({
      extensions: { code: 'VEHICLE_NOT_FOUND' },
    });
    expect(mail.sendVehicleDeletionEmail).not.toHaveBeenCalled();
  });
  it.each(['', '0', '-1', '1.5', 'NaN', 'Infinity', '1e2', '2147483648'])(
    'rejects invalid retention configuration %s at startup',
    (value) => {
      expect(
        () =>
          new VehiclesService(
            prisma as unknown as PrismaService,
            new ConfigService({ VEHICLE_DELETION_RETENTION_DAYS: value }),
            mail as unknown as MailService,
          ),
      ).toThrow('VEHICLE_DELETION_RETENTION_DAYS');
    },
  );
  it('requires retention configuration and reads the environment via ConfigService', () => {
    vi.stubEnv('VEHICLE_DELETION_RETENTION_DAYS', undefined);
    expect(
      () =>
        new VehiclesService(
          prisma as unknown as PrismaService,
          new ConfigService(),
          mail as unknown as MailService,
        ),
    ).toThrow('VEHICLE_DELETION_RETENTION_DAYS');
    vi.stubEnv('VEHICLE_DELETION_RETENTION_DAYS', '61');
    const configured = new VehiclesService(
      prisma as unknown as PrismaService,
      new ConfigService(),
      mail as unknown as MailService,
    );
    expect(configured.deletionRetentionDays()).toBe(61);
  });
  it('scopes listing and bounds mileage by chronology rather than maximum reading', async () => {
    prisma.vehicle.findMany.mockResolvedValue([vehicle]);
    expect(await service.list('owner')).toEqual([{ id, brand: 'Ford', latestOdometerKm: 1200 }]);
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner', deletedAt: null },
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
      expect.objectContaining({ where: { id, userId: 'owner', deletedAt: null } }),
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
        where: { id, userId: 'other', deletedAt: null },
        data: expect.objectContaining({ fuelType: null }),
      }),
    );
  });
});
