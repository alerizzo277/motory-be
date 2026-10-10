import { Inject, Injectable } from '@nestjs/common';
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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async list(userId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: vehicleSelect,
    });
    return vehicles.map(publicVehicle);
  }
  async get(userId: string, id: string) {
    checkId(id);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, userId },
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
        where: { id, userId },
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
