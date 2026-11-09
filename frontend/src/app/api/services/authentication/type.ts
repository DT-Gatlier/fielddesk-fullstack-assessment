export interface User {
  id: string
  email: string
  name: string
  role: 'owner' | 'dispatcher' | 'technician' | string
  organisationId: string
  organisationName: string
}

export interface UserInfo {
  user: User
}

export interface PermissionsResponse {
  role: string
  permissions: string[]
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export interface RefreshTokenResponse {
  accessToken: string
  refreshToken: string
}

export interface LogOutResponse {
  success?: boolean
  message?: string
}

