import { validateEnvironment } from './environment';

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:sample_password@localhost:5432/fielddesk',
  REDIS_URL: 'redis://localhost:6379',
};

describe('API environment validation', () => {
  it('returns typed settings and defaults the port', () => {
    expect(validateEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      PORT: 3001,
      ALLOWED_ORIGINS: ['http://localhost:3000'],
      SESSION_TTL_SECONDS: 28800,
      COOKIE_SECURE: false,
      REDIS_KEY_PREFIX: 'fielddesk',
    });
  });

  it.each([
    '',
    'null',
    'https://example.com/path',
    '*',
    'https://user:password@example.com',
  ])('rejects origin setting %s', (ALLOWED_ORIGINS) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, ALLOWED_ORIGINS }),
    ).toThrow('ALLOWED_ORIGINS');
  });
  it.each(['0', '59', '604801', 'eight', '28800.5'])(
    'rejects session lifetime %s',
    (SESSION_TTL_SECONDS) => {
      expect(() =>
        validateEnvironment({ ...validEnvironment, SESSION_TTL_SECONDS }),
      ).toThrow('SESSION_TTL_SECONDS');
    },
  );
  it('requires secure cookies in production and validates explicit booleans', () => {
    expect(
      validateEnvironment({ ...validEnvironment, NODE_ENV: 'production' })
        .COOKIE_SECURE,
    ).toBe(true);
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow('COOKIE_SECURE');
    expect(() =>
      validateEnvironment({ ...validEnvironment, COOKIE_SECURE: 'yes' }),
    ).toThrow('COOKIE_SECURE');
  });
  it('rejects unsafe Redis namespaces without printing the value', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        REDIS_KEY_PREFIX: 'secret/password',
      }),
    ).toThrow('REDIS_KEY_PREFIX');
  });

  it.each(['1', '65535', '3002', 3002])('accepts port %s', (PORT) => {
    expect(validateEnvironment({ ...validEnvironment, PORT }).PORT).toBe(
      Number(PORT),
    );
  });

  it.each(['', '0', '65536', '-1', '3.5', '3001abc', ' 3001 ', true, Infinity])(
    'rejects invalid port %s',
    (PORT) => {
      expect(() => validateEnvironment({ ...validEnvironment, PORT })).toThrow(
        'PORT must be an integer from 1 to 65535',
      );
    },
  );

  it.each(['DATABASE_URL', 'REDIS_URL'])('requires %s', (setting) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, [setting]: undefined }),
    ).toThrow(setting);
  });

  it.each([
    ['DATABASE_URL', 'https://localhost/database'],
    ['DATABASE_URL', 'postgresql:///database'],
    ['DATABASE_URL', 'not-a-url'],
    ['REDIS_URL', 'https://localhost'],
    ['REDIS_URL', 'redis:///0'],
    ['REDIS_URL', ''],
  ])('rejects invalid %s', (setting, value) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, [setting]: value }),
    ).toThrow(setting);
  });

  it('accepts supported alternate and TLS protocols', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: 'postgres://user:password@postgres:5432/fielddesk',
        REDIS_URL: 'rediss://user:password@redis:6379/0',
      }),
    ).toMatchObject({ PORT: 3001 });
  });

  it('reports all invalid settings without exposing their values', () => {
    const secret = 'private_password_marker';
    try {
      validateEnvironment({
        PORT: 'invalid',
        DATABASE_URL: `https://user:${secret}@localhost/database`,
        REDIS_URL: `https://user:${secret}@localhost`,
      });
      throw new Error('Expected validation to reject invalid settings');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('PORT');
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('REDIS_URL');
      expect(message).not.toContain(secret);
      expect(message).not.toContain('https://');
    }
  });
});
