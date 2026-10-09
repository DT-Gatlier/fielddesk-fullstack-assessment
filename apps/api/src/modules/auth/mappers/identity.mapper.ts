import type { Identity } from '../interfaces/auth-identity.interface';

export function toIdentity(user: Identity): Identity {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organisation: { id: user.organisation.id, name: user.organisation.name },
  };
}
