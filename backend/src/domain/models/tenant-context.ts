export type UserRole = 'owner' | 'dispatcher' | 'technician';

export interface TenantContext {
  readonly organisationId: string;
  readonly userId: string;
  readonly role: UserRole;
  readonly correlationId: string;
}

