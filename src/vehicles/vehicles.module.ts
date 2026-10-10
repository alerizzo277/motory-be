import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { VehiclesResolver } from './vehicles.resolver.js';
import { VehiclesService } from './vehicles.service.js';
@Module({ imports: [AuthModule, PrismaModule], providers: [VehiclesResolver, VehiclesService] })
export class VehiclesModule {}
