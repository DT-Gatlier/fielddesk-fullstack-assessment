export const roles = ['owner', 'dispatcher', 'technician'] as const;
export type Role = (typeof roles)[number];

export interface AuthIdentity {
  userId: string;
  organisationId: string;
  role: Role;
  tokenVersion: number;
}
