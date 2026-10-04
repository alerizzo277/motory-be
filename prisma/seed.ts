import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL non definita o vuota');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const roles = ['ADMIN', 'USER'];
    const categories = [
      'MAINTENANCE',
      'REPLACEMENT',
      'REPAIR',
      'PAYMENT',
      'INSPECTION',
      'OTHER',
    ];

    await prisma.$transaction(async (tx) => {
      for (const name of roles) {
        await tx.role.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }

      for (const name of categories) {
        await tx.category.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }
    });

    console.log('Seed completato: ruoli e categorie disponibili.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});