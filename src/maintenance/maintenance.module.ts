import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MaintenanceResolver } from './maintenance.resolver.js';
import { MaintenanceService } from './maintenance.service.js';
@Module({
  imports: [AuthModule, PrismaModule],
  providers: [MaintenanceResolver, MaintenanceService],
})
export class MaintenanceModule {}
