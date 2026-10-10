import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { applicationError } from '../common/graphql-errors.js';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
export type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;
export function publicUser({
  passwordHash: _passwordHash,
  roleId: _roleId,
  role,
  ...user
}: UserWithRole) {
  return { ...user, role: role.name };
}
@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      include: { role: true },
    });
  }
  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  }
  async create(data: { email: string; passwordHash: string; firstName: string; lastName: string }) {
    const userRole = await this.prisma.role.findUnique({
      where: { name: 'USER' },
    });
    if (!userRole) {
      throw applicationError('INTERNAL_SERVER_ERROR', 'Registration is temporarily unavailable.');
    }
    try {
      return await this.prisma.user.create({
        data: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email: normalizeEmail(data.email),
          passwordHash: data.passwordHash,
          roleId: userRole.id,
        },
        include: { role: true },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw applicationError(
          'EMAIL_ALREADY_EXISTS',
          'An account with this email already exists.',
        );
      }
      throw error;
    }
  }
}
