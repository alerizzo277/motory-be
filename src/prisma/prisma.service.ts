import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    if (!connectionString.trim()) {
      throw new Error('DATABASE_URL must not be empty');
    }

    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }
}
