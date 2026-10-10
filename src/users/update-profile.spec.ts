import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

describe('UsersService profile updates', () => {
  it('whitelists persistence fields even when called outside the GraphQL validation boundary', async () => {
    const row = {
      id: 'current-user',
      firstName: 'Alice Maria',
      lastName: 'Rossi',
      email: 'alice@example.com',
      role: { name: 'USER' },
      roleId: 'role-id',
      passwordHash: 'private-hash',
    };
    const prisma = { user: { update: vi.fn().mockResolvedValue(row) } };
    const service = new UsersService(prisma as unknown as PrismaService);
    const input = {
      firstName: ' Alice \t Maria ',
      email: 'attacker@example.com',
      roleId: 'ADMIN',
      userId: 'other',
      passwordHash: 'attacker',
    };
    const result = await service.updateProfile('current-user', input);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'current-user' },
      data: { firstName: 'Alice Maria' },
      include: { role: true },
    });
    expect(result).toMatchObject({ role: 'USER', email: 'alice@example.com' });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('roleId');
  });
  it.each(['', ' \n ', 'a'.repeat(101), null, 42])(
    'rejects invalid names before persistence: %j',
    async (value) => {
      const prisma = { user: { update: vi.fn() } };
      const service = new UsersService(prisma as unknown as PrismaService);
      await expect(
        service.updateProfile('current-user', { firstName: value as string }),
      ).rejects.toMatchObject({ extensions: { code: 'VALIDATION_ERROR' } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );
  it('maps a disappeared authenticated user to the existing controlled error', async () => {
    const prisma = {
      user: {
        update: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('private', {
            code: 'P2025',
            clientVersion: '7',
          }),
        ),
      },
    };
    await expect(
      new UsersService(prisma as unknown as PrismaService).updateProfile('current-user', {
        lastName: 'Rossi',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'USER_NOT_FOUND' } });
  });
});
