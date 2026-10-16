import type { Role } from '../types';

/**
 * Single source of truth for role permissions, enforced by `requirePermission`
 * on every route. Row-level rules (a technician only sees work orders assigned
 * to them) are applied additionally inside the queries.
 *
 * Assumption: the owner is an administrator and can do everything a
 * dispatcher can, in addition to managing users and organisation settings.
 */
export const PERMISSIONS = {
  'org:read': ['owner', 'dispatcher', 'technician'],
  'org:manage': ['owner'],
  'users:read': ['owner', 'dispatcher'], // dispatchers need the technician list to assign work
  'users:manage': ['owner'],
  'audit:read': ['owner'],
  'workOrders:read': ['owner', 'dispatcher', 'technician'], // technicians: assigned only
  'workOrders:write': ['owner', 'dispatcher'],
  'workOrders:export': ['owner', 'dispatcher'],
  'events:submit': ['technician'],
  'attachments:read': ['owner', 'dispatcher', 'technician'], // technicians: assigned only
  'attachments:upload': ['owner', 'dispatcher', 'technician'], // technicians: assigned only
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
