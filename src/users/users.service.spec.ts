import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService registration races', () => {
  it('maps the database uniqueness error when concurrent registrations bypass the precheck', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-role-id', name: 'USER' }),
      },
      user: {
        create: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Database details', {
            code: 'P2002',
            clientVersion: '7.10.0',
          }),
        ),
      },
    };
    const users = new UsersService(prisma as unknown as PrismaService);
    await expect(
      users.create({
        email: ' Alice@Example.com ',
        passwordHash: 'hash',
        firstName: 'Alice',
        lastName: 'Rossi',
      }),
    ).rejects.toMatchObject({
      message: 'An account with this email already exists.',
      extensions: { code: 'EMAIL_ALREADY_EXISTS' },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      include: { role: true },
      data: {
        email: 'alice@example.com',
        passwordHash: 'hash',
        firstName: 'Alice',
        lastName: 'Rossi',
        roleId: 'user-role-id',
      },
    });
  });
  it('normalizes persistence data and ignores fields outside the creation contract', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-role-id', name: 'USER' }),
      },
      user: { create: vi.fn().mockResolvedValue({}) },
    };
    const users = new UsersService(prisma as unknown as PrismaService);
    const data = {
      email: ' Alice@Example.com ',
      firstName: ' Alice ',
      lastName: ' Rossi ',
      passwordHash: 'hash',
      roleId: 'admin-role-id',
      role: { connect: { name: 'ADMIN' } },
    };
    await users.create(data);
    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'USER' },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      include: { role: true },
      data: {
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Rossi',
        passwordHash: 'hash',
        roleId: 'user-role-id',
      },
    });
  });
});
