import type { UserRole } from '@fielddesk/database';

export interface Identity {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organisation: { id: string; name: string };
}
