import { registerEnumType } from '@nestjs/graphql';

// Public terminology maps to the existing persisted status without a migration.
export const MaintenanceStatus = { SCHEDULED: 'SCHEDULED', EXECUTED: 'COMPLETED' } as const;
export type MaintenanceStatus = (typeof MaintenanceStatus)[keyof typeof MaintenanceStatus];
registerEnumType(MaintenanceStatus, { name: 'MaintenanceEventStatus' });
