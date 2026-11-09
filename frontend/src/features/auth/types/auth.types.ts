export type UserRole = 'owner' | 'dispatcher' | 'technician';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organisationId: string;
  organisationName: string;
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

