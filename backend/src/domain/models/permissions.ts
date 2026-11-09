import { UserRole } from '../models/tenant-context.js';

export type Permission =
  // Work Order permissions
  | 'work_orders:read'
  | 'work_orders:create'
  | 'work_orders:assign'
  | 'work_orders:update_status'
  | 'work_orders:delete'
  // Events
  | 'events:submit'
  // Attachments
  | 'attachments:upload'
  | 'attachments:view'
  | 'attachments:delete'
  // Team / Technicians
  | 'team:read'
  | 'team:manage'
  // Organisation & Settings
  | 'org:manage_settings'
  | 'org:view_audit_logs'
  // Reporting
  | 'reports:export';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'work_orders:read',
    'work_orders:create',
    'work_orders:assign',
    'work_orders:update_status',
    'work_orders:delete',
    'events:submit',
    'attachments:upload',
    'attachments:view',
    'attachments:delete',
    'team:read',
    'team:manage',
    'org:manage_settings',
    'org:view_audit_logs',
    'reports:export',
  ],
  dispatcher: [
    'work_orders:read',
    'work_orders:create',
    'work_orders:assign',
    'work_orders:update_status',
    'events:submit',
    'attachments:upload',
    'attachments:view',
    'team:read',
    'org:view_audit_logs',
    'reports:export',
  ],
  technician: [
    'work_orders:read',
    'work_orders:update_status',
    'events:submit',
    'attachments:upload',
    'attachments:view',
  ],
};

export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

