import { OrganisationResDto } from '../../../common/dtos/organisation-res.dto';
import { AuthResDto } from './auth-res.dto';
import { CsrfResDto } from './csrf-res.dto';

describe('Safe HTTP response mapping', () => {
  const organisation = {
    id: 'organisation-id',
    name: 'FieldDesk',
    privateSetting: 'secret',
  };
  const identity = {
    id: 'user-id',
    email: 'owner@fielddesk.example',
    name: 'Owner',
    role: 'OWNER' as const,
    organisation,
    passwordHash: 'private-password-hash',
    tokenHash: 'private-session-hash',
    authVersion: 9,
  };
  it('includes only public identity and organisation fields', () => {
    expect(JSON.parse(JSON.stringify(AuthResDto.fromData(identity)))).toEqual({
      user: {
        id: identity.id,
        email: identity.email,
        name: identity.name,
        role: identity.role,
        organisation: { id: organisation.id, name: organisation.name },
      },
    });
    expect(
      JSON.parse(JSON.stringify(OrganisationResDto.fromData(organisation))),
    ).toEqual({ id: organisation.id, name: organisation.name });
  });
  it('returns only the intentional CSRF token', () => {
    expect(
      JSON.parse(JSON.stringify(CsrfResDto.fromData('csrf-token'))),
    ).toEqual({ csrfToken: 'csrf-token' });
  });
});
