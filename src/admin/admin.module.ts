import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminGuard } from './admin.guard.js';
import { AdminResolver } from './admin.resolver.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [AdminGuard, AdminResolver, AdminService],
})
export class AdminModule {}
