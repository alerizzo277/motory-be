import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('Vehicle soft-delete migration', () => {
  it('adds only a nullable timestamp without updating existing rows or relationships', () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          '../../prisma/migrations/20261010200000_vehicle_soft_delete/migration.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    expect(sql.replace(/^--.*$/gm, '').trim()).toBe(
      'ALTER TABLE "Vehicle" ADD COLUMN     "deletedAt" TIMESTAMP(3);',
    );
    const schema = readFileSync(
      fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)),
      'utf8',
    );
    const vehicle = schema.match(/model Vehicle \{([\s\S]*?)\n\}/)?.[1];
    expect(vehicle).toMatch(/deletedAt\s+DateTime\?/);
    expect(vehicle).not.toMatch(/deletedAt[^\n]*@default/);
    expect(schema.match(/model MaintenanceEvent \{([\s\S]*?)\n\}/)?.[1]).not.toMatch(
      /deletedAt|onDelete/,
    );
  });
});
