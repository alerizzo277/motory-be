import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { ConfigService } from '@nestjs/config';

describe('PrismaService', () => {
  let service: PrismaService;
  let module: TestingModule | undefined;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'postgresql://test:test@localhost:5432/test',
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    try {
      await service?.$disconnect();
    } finally {
      await module?.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
