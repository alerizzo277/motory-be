import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Prisma, type MaintenanceEvent } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applicationError } from '../common/graphql-errors.js';
import type {
  CreateMaintenanceEventInput,
  UpdateMaintenanceEventInput,
  NextScheduledEventInput,
} from './dto/maintenance.input.js';
import type { MaintenanceStatus } from './maintenance-status.js';

function invalid(message: string): never {
  throw applicationError('VALIDATION_ERROR', message);
}
function checkId(id: string) {
  if (typeof id !== 'string' || !isUUID(id)) invalid('Invalid resource ID.');
}
function text(value: string, field: string, limit: number, collapse = false) {
  if (typeof value !== 'string') invalid(`Invalid ${field}.`);
  const result = collapse ? value.trim().replace(/\s+/g, ' ') : value.trim();
  if ((collapse && !result) || result.length > limit) invalid(`Invalid ${field}.`);
  return result;
}
function date(value: string | null | undefined, field: string) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid(`Invalid ${field}; use YYYY-MM-DD.`);
  const result = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value)
    invalid(`Invalid ${field}.`);
  return result;
}
function mileage(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 2147483647)
    invalid('Mileage must be a non-negative integer.');
  return value;
}
function money(value: string | null | undefined) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value))
    invalid('Invalid cost; use a non-negative decimal amount with at most two decimal places.');
  return new Prisma.Decimal(value);
}
function publicEvent(event: MaintenanceEvent) {
  return { ...event, cost: event.cost?.toFixed(2) ?? null };
}
type EventData = Omit<Prisma.MaintenanceEventUncheckedCreateInput, 'vehicleId'>;

@Injectable()
export class MaintenanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async categories() {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
    return rows.map(({ id, name }) => ({ id, code: name }));
  }
  private async ownedVehicle(db: Prisma.TransactionClient, userId: string, id: string) {
    checkId(id);
    if (
      !(await db.vehicle.findFirst({
        where: { id, userId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw applicationError('VEHICLE_NOT_FOUND', 'Vehicle not found.');
  }
  private async ownedEvent(db: Prisma.TransactionClient, userId: string, id: string) {
    checkId(id);
    const event = await db.maintenanceEvent.findFirst({
      where: { id, vehicle: { userId, deletedAt: null } },
    });
    if (!event)
      throw applicationError('MAINTENANCE_EVENT_NOT_FOUND', 'Maintenance event not found.');
    return event;
  }
  async list(userId: string, vehicleId: string, status?: MaintenanceStatus | null) {
    await this.ownedVehicle(this.prisma, userId, vehicleId);
    const fetch = (eventStatus: MaintenanceStatus) =>
      this.prisma.maintenanceEvent.findMany({
        where: { vehicleId, vehicle: { userId, deletedAt: null }, status: eventStatus },
        orderBy:
          eventStatus === 'COMPLETED'
            ? [{ executionDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
            : [{ scheduledDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      });
    // Unfiltered lists group scheduled events first and retain each state's chronology.
    const rows = status
      ? await fetch(status)
      : (await Promise.all([fetch('SCHEDULED'), fetch('COMPLETED')])).flat();
    return rows.map(publicEvent);
  }

  async get(userId: string, id: string) {
    return publicEvent(await this.ownedEvent(this.prisma, userId, id));
  }

  async delete(userId: string, id: string) {
    try {
      await this.ownedEvent(this.prisma, userId, id);
      // Recheck ownership in the write to protect against changes after the read.
      await this.prisma.maintenanceEvent.delete({
        where: { id, vehicle: { userId, deletedAt: null } },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw applicationError('MAINTENANCE_EVENT_NOT_FOUND', 'Maintenance event not found.');
      throw error;
    }
  }

  private async validate(
    db: Prisma.TransactionClient,
    input: Omit<CreateMaintenanceEventInput, 'vehicleId' | 'nextScheduledEvent'>,
  ): Promise<EventData> {
    const name = text(input.name, 'name', 200, true);
    checkId(input.categoryId);
    if (!(await db.category.findUnique({ where: { id: input.categoryId }, select: { id: true } })))
      invalid('Invalid category.');
    if (input.status !== 'SCHEDULED' && input.status !== 'COMPLETED')
      invalid('Invalid event status.');
    const scheduledDate = date(input.scheduledDate, 'scheduledDate');
    const scheduledOdometerKm = mileage(input.scheduledOdometerKm);
    const executionDate = date(input.executionDate, 'executionDate');
    const odometerKm = mileage(input.odometerKm);
    const cost = money(input.cost);
    const provider = input.provider == null ? null : text(input.provider, 'provider', 200);
    const notes = input.notes == null ? null : text(input.notes, 'notes', 10000);
    if (input.status === 'SCHEDULED') {
      if (scheduledDate === null && scheduledOdometerKm === null)
        invalid('Scheduled events require a date or mileage.');
      if (executionDate !== null || odometerKm !== null || cost !== null || provider !== null)
        invalid('Scheduled events cannot contain execution data.');
    } else {
      if (!executionDate) invalid('Executed events require executionDate.');
      if (executionDate.toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10))
        invalid('Execution date must not be in the future.');
    }
    return {
      name,
      categoryId: input.categoryId,
      status: input.status,
      scheduledDate,
      scheduledOdometerKm,
      executionDate,
      odometerKm,
      cost,
      provider,
      notes,
    };
  }
  private async nextData(
    db: Prisma.TransactionClient,
    status: MaintenanceStatus,
    input?: NextScheduledEventInput | null,
  ) {
    if (input == null) return null;
    if (status !== 'COMPLETED') invalid('Rescheduling requires an executed main event.');
    return this.validate(db, {
      name: input.name,
      categoryId: input.categoryId,
      scheduledDate: input.scheduledDate,
      scheduledOdometerKm: input.scheduledOdometerKm,
      notes: input.notes,
      status: 'SCHEDULED',
    });
  }
  async create(userId: string, input: CreateMaintenanceEventInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.ownedVehicle(tx, userId, input.vehicleId);
      const data = await this.validate(tx, input);
      const next = await this.nextData(tx, input.status, input.nextScheduledEvent);
      const event = await tx.maintenanceEvent.create({
        data: { ...data, vehicleId: input.vehicleId },
      });
      const nextScheduledEvent = next
        ? await tx.maintenanceEvent.create({ data: { ...next, vehicleId: input.vehicleId } })
        : null;
      return {
        event: publicEvent(event),
        nextScheduledEvent: nextScheduledEvent ? publicEvent(nextScheduledEvent) : null,
      };
    });
  }
  async update(userId: string, id: string, input: UpdateMaintenanceEventInput) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const previous = await this.ownedEvent(tx, userId, id);
          // Merge only supplied fields: explicit null clears optional values, omission preserves history.
          const merged = {
            ...previous,
            scheduledDate: previous.scheduledDate?.toISOString().slice(0, 10) ?? null,
            executionDate: previous.executionDate?.toISOString().slice(0, 10) ?? null,
            cost: previous.cost?.toFixed(2) ?? null,
            ...Object.fromEntries(
              Object.entries(input).filter(
                ([key, value]) => key !== 'nextScheduledEvent' && value !== undefined,
              ),
            ),
          };
          if (previous.status === 'COMPLETED' && merged.status === 'SCHEDULED')
            invalid('Executed events cannot return to scheduled status.');
          const validated = await this.validate(tx, merged);
          const supplied = new Set(
            Object.entries(input)
              .filter(([, value]) => value !== undefined)
              .map(([key]) => key),
          );
          const data = Object.fromEntries(
            Object.entries(validated).filter(([key]) => supplied.has(key)),
          );
          const next = await this.nextData(tx, merged.status, input.nextScheduledEvent);
          const event = await tx.maintenanceEvent.update({
            where: { id, vehicle: { userId, deletedAt: null }, status: previous.status },
            data,
          });
          const nextScheduledEvent = next
            ? await tx.maintenanceEvent.create({ data: { ...next, vehicleId: previous.vehicleId } })
            : null;
          return {
            event: publicEvent(event),
            nextScheduledEvent: nextScheduledEvent ? publicEvent(nextScheduledEvent) : null,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw applicationError('MAINTENANCE_EVENT_NOT_FOUND', 'Maintenance event not found.');
      throw error;
    }
  }
}
