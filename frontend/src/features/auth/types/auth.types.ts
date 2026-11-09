export type UserRole = 'owner' | 'dispatcher' | 'technician';

export type Permission =
  | 'work_orders:read'
  | 'work_orders:create'
  | 'work_orders:assign'
  | 'work_orders:update_status'
  | 'work_orders:delete'
  | 'events:submit'
  | 'attachments:upload'
  | 'attachments:view'
  | 'attachments:delete'
  | 'team:read'
  | 'team:manage'
  | 'org:manage_settings'
  | 'org:view_audit_logs'
  | 'reports:export';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organisationId: string;
  organisationName: string;
}

export interface PermissionsResponse {
  role: UserRole;
  permissions: Permission[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ApiErrorResponse {
  type?: string;
  title?: string;
  status: number;
  code?: string;
  detail: string;
  errors?: Array<{ field: string; message: string }>;
  correlationId?: string;
}

