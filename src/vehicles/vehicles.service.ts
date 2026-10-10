import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service.js';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { applicationError } from '../common/graphql-errors.js';
import type { CreateVehicleInput, UpdateVehicleInput } from './dto/vehicle.input.js';

// A bounded relation selection avoids fetching all events or querying each vehicle separately.
const vehicleSelect = {
  id: true,
  brand: true,
  model: true,
  year: true,
  licensePlate: true,
  fuelType: true,
  createdAt: true,
  updatedAt: true,
  maintenanceEvents: {
    where: { status: 'COMPLETED', odometerKm: { not: null }, executionDate: { not: null } },
    orderBy: [{ executionDate: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { odometerKm: true },
  },
} satisfies Prisma.VehicleSelect;
type SelectedVehicle = Prisma.VehicleGetPayload<{ select: typeof vehicleSelect }>;
function publicVehicle({ maintenanceEvents, ...vehicle }: SelectedVehicle) {
  return { ...vehicle, latestOdometerKm: maintenanceEvents[0]?.odometerKm ?? null };
}
function checkId(id: string) {
  if (!isUUID(id)) throw applicationError('VALIDATION_ERROR', 'Invalid vehicle ID.');
}
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MailService) private readonly mail: MailService,
  ) {
    this.deletionRetentionDays();
  }
  deletionRetentionDays() {
    const configured = this.config.getOrThrow<string>('VEHICLE_DELETION_RETENTION_DAYS');
    const days = Number(configured);
    // The public GraphQL Int field must also be able to represent this value.
    if (!/^[1-9]\d*$/.test(String(configured)) || !Number.isSafeInteger(days) || days > 2147483647)
      throw new Error('VEHICLE_DELETION_RETENTION_DAYS must be a positive GraphQL integer');
    return days;
  }
  private recoveryWindow() {
    // Fixed elapsed UTC milliseconds, shared by listing and the conditional restoration write.
    const durationMs = this.deletionRetentionDays() * 24 * 60 * 60 * 1000;
    return { durationMs, cutoff: new Date(Date.now() - durationMs) };
  }
  async deletedVehicles(userId: string) {
    const { cutoff, durationMs } = this.recoveryWindow();
    const rows = await this.prisma.vehicle.findMany({
      where: { userId, deletedAt: { gt: cutoff } },
      orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        brand: true,
        model: true,
        year: true,
        licensePlate: true,
        deletedAt: true,
      },
    });
    return rows.flatMap((vehicle) =>
      vehicle.deletedAt === null
        ? []
        : [
            {
              ...vehicle,
              recoveryDeadline: new Date(vehicle.deletedAt.getTime() + durationMs),
            },
          ],
    );
  }
  async restore(userId: string, id: string) {
    checkId(id);
    const { cutoff } = this.recoveryWindow();
    try {
      // Null, expired and foreign records cannot match; competing updates have one winner.
      await this.prisma.vehicle.update({
        where: { id, userId, deletedAt: { gt: cutoff } },
        data: { deletedAt: null },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw applicationError('VEHICLE_NOT_FOUND', 'Vehicle not found.');
      throw error;
    }
  }
  async delete(userId: string, id: string) {
    checkId(id);
    const retentionDays = this.deletionRetentionDays();
    let vehicle;
    try {
      // One conditional write lets only one concurrent deletion succeed.
      vehicle = await this.prisma.vehicle.update({
        where: { id, userId, deletedAt: null },
        data: { deletedAt: new Date() },
        select: { brand: true, model: true, licensePlate: true, user: { select: { email: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw applicationError('VEHICLE_NOT_FOUND', 'Vehicle not found.');
      throw error;
    }
    // Delivery is best-effort and happens after the database write has committed.
    try {
      await this.mail.sendVehicleDeletionEmail(vehicle.user.email, vehicle, retentionDays);
    } catch {
      this.logger.warn('Vehicle deletion notification could not be delivered');
    }
    return true;
  }
  async list(userId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: vehicleSelect,
    });
    return vehicles.map(publicVehicle);
  }
  async get(userId: string, id: string) {
    checkId(id);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, userId, deletedAt: null },
      select: vehicleSelect,
    });
    if (!vehicle) throw applicationError('VEHICLE_NOT_FOUND', 'Vehicle not found.');
    return publicVehicle(vehicle);
  }
  async create(userId: string, input: CreateVehicleInput) {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        userId,
        brand: input.brand,
        model: input.model,
        year: input.year,
        licensePlate: input.licensePlate,
        fuelType: input.fuelType ?? null,
      },
      select: vehicleSelect,
    });
    return publicVehicle(vehicle);
  }
  async update(userId: string, id: string, input: UpdateVehicleInput) {
    checkId(id);
    try {
      const vehicle = await this.prisma.vehicle.update({
        where: { id, userId, deletedAt: null },
        data: {
          brand: input.brand,
          model: input.model,
          year: input.year,
          licensePlate: input.licensePlate,
          fuelType: input.fuelType,
        },
        select: vehicleSelect,
      });
      return publicVehicle(vehicle);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw applicationError('VEHICLE_NOT_FOUND', 'Vehicle not found.');
      throw error;
    }
  }
}
