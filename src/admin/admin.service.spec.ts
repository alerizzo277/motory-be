import { randomUUID } from 'node:crypto';
import { AdminService } from './admin.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const id = randomUUID();
const row = {
  id,
  firstName: 'Alice',
  lastName: 'Rossi',
  email: 'alice@example.com',
  createdAt: new Date(),
  emailVerifiedAt: null,
  role: { name: 'ADMIN' },
  passwordHash: 'private',
};
describe('AdminService', () => {
  const db = {
    user: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    vehicle: { count: vi.fn() },
    maintenanceEvent: { count: vi.fn() },
  };
  const service = new AdminService(db as unknown as PrismaService);
  beforeEach(() => {
    vi.resetAllMocks();
    db.user.findUnique.mockResolvedValue(row);
    db.user.findMany.mockResolvedValue([row]);
    db.user.count.mockResolvedValue(1);
    db.vehicle.count.mockResolvedValue(2);
    db.maintenanceEvent.count.mockResolvedValue(3);
  });
  it('uses counts, a bounded recent-user query and an explicit safe projection', async () => {
    const result = await service.dashboard();
    expect(result).toMatchObject({
      totalUsers: 1,
      verifiedUsers: 1,
      activeVehicles: 2,
      deletedVehicles: 2,
      totalMaintenanceEvents: 3,
    });
    expect(Object.keys(result.recentUsers[0])).toEqual([
      'id',
      'firstName',
      'lastName',
      'email',
      'createdAt',
      'emailVerified',
      'roles',
    ]);
    expect(result.recentUsers[0]).toMatchObject({ emailVerified: false, roles: ['ADMIN'] });
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
          emailVerifiedAt: true,
          role: { select: { name: true } },
        },
      }),
    );
    expect(db.vehicle.count.mock.calls).toEqual([
      [{ where: { deletedAt: null } }],
      [{ where: { deletedAt: { not: null } } }],
    ]);
    expect(db.maintenanceEvent.count).toHaveBeenCalledWith();
    expect(db.user.count).toHaveBeenCalledWith({ where: { emailVerifiedAt: { not: null } } });
  });
  it('shares normalized case-insensitive search between count and database pagination', async () => {
    await service.users({ page: 2, pageSize: 20, search: '  Alice   Rossi  ' });
    const args = db.user.findMany.mock.calls[0][0];
    expect(args).toMatchObject({
      skip: 20,
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(db.user.count).toHaveBeenCalledWith({ where: args.where });
    expect(args.where.OR).toContainEqual({
      email: { contains: 'Alice Rossi', mode: 'insensitive' },
    });
    expect(args.where.OR[3].AND).toHaveLength(2);
  });
  it.each([
    { page: 0, pageSize: 20 },
    { page: -1, pageSize: 20 },
    { page: 1.5, pageSize: 20 },
    { page: 1, pageSize: 0 },
    { page: 1, pageSize: 101 },
    { page: 1, pageSize: 1.5 },
    { page: 2147483647, pageSize: 100 },
  ])('rejects unsafe pagination %j', async (args) => {
    await expect(service.users(args)).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it('returns empty pages and normalizes whitespace-only search', async () => {
    db.user.findMany.mockResolvedValue([]);
    db.user.count.mockResolvedValue(0);
    expect(await service.users({ page: 1, pageSize: 20, search: ' \t ' })).toEqual({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    expect(db.user.count).toHaveBeenCalledWith({ where: {} });
  });
  it('counts only the requested user without excluding deleted-vehicle events', async () => {
    expect(await service.user(id)).toMatchObject({
      id,
      activity: { activeVehiclesCount: 2, deletedVehiclesCount: 2, totalMaintenanceEventsCount: 3 },
    });
    expect(db.vehicle.count.mock.calls).toEqual([
      [{ where: { userId: id, deletedAt: null } }],
      [{ where: { userId: id, deletedAt: { not: null } } }],
    ]);
    expect(db.maintenanceEvent.count).toHaveBeenCalledWith({ where: { vehicle: { userId: id } } });
  });
  it('controls invalid IDs and missing users before counting', async () => {
    await expect(service.user('bad')).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.user(id)).rejects.toMatchObject({
      extensions: { code: 'USER_NOT_FOUND' },
    });
    expect(db.vehicle.count).not.toHaveBeenCalled();
  });
});
