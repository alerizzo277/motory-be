import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applicationError } from '../common/graphql-errors.js';
import type { AdminUsersArgs } from './dto/admin-users.args.js';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
  emailVerifiedAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;
const userOrder = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.UserOrderByWithRelationInput[];
type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;
function summary(user: SelectedUser) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.createdAt,
    emailVerified: user.emailVerifiedAt !== null,
    roles: [user.role.name],
  };
}

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async dashboard() {
    const [
      totalUsers,
      verifiedUsers,
      activeVehicles,
      deletedVehicles,
      totalMaintenanceEvents,
      users,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      this.prisma.vehicle.count({ where: { deletedAt: null } }),
      this.prisma.vehicle.count({ where: { deletedAt: { not: null } } }),
      this.prisma.maintenanceEvent.count(),
      this.prisma.user.findMany({ select: userSelect, orderBy: userOrder, take: 5 }),
    ]);
    return {
      totalUsers,
      verifiedUsers,
      activeVehicles,
      deletedVehicles,
      totalMaintenanceEvents,
      recentUsers: users.map(summary),
    };
  }

  async users({ page, pageSize, search }: AdminUsersArgs) {
    const skip = (page - 1) * pageSize;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 2147483647 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      skip > 2147483647
    ) {
      throw applicationError('VALIDATION_ERROR', 'Invalid pagination.');
    }
    const normalized = search?.trim().replace(/\s+/g, ' ');
    const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
    const where: Prisma.UserWhereInput = normalized
      ? {
          OR: [
            { firstName: contains(normalized) },
            { lastName: contains(normalized) },
            { email: contains(normalized) },
            // Match every word against either name, including compound surnames.
            {
              AND: normalized.split(' ').map((word) => ({
                OR: [{ firstName: contains(word) }, { lastName: contains(word) }],
              })),
            },
          ],
        }
      : {};
    const [users, totalCount] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: userOrder,
        skip,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: users.map(summary),
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  async user(id: string) {
    if (!isUUID(id)) throw applicationError('VALIDATION_ERROR', 'Invalid user ID.');
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw applicationError('USER_NOT_FOUND', 'User not found.');
    const [activeVehiclesCount, deletedVehiclesCount, totalMaintenanceEventsCount] =
      await Promise.all([
        this.prisma.vehicle.count({ where: { userId: id, deletedAt: null } }),
        this.prisma.vehicle.count({ where: { userId: id, deletedAt: { not: null } } }),
        this.prisma.maintenanceEvent.count({ where: { vehicle: { userId: id } } }),
      ]);
    return {
      ...summary(user),
      activity: { activeVehiclesCount, deletedVehiclesCount, totalMaintenanceEventsCount },
    };
  }
}
