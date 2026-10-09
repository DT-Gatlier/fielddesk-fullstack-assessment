export interface ApiEnvironment {
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  ALLOWED_ORIGINS: string[];
  SESSION_TTL_SECONDS: number;
  COOKIE_SECURE: boolean;
  REDIS_KEY_PREFIX: string;
}

function isServiceUrl(value: unknown, protocols: string[]): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && url.hostname !== '';
  } catch {
    return false;
  }
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): ApiEnvironment {
  const rawPort = environment.PORT ?? 3001;
  const port =
    typeof rawPort === 'number'
      ? rawPort
      : typeof rawPort === 'string' && /^\d+$/.test(rawPort)
        ? Number(rawPort)
        : NaN;
  const errors: string[] = [];
  const origins =
    typeof environment.ALLOWED_ORIGINS === 'string'
      ? environment.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
      : ['http://localhost:3000'];
  if (
    !origins.length ||
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== origin
        );
      } catch {
        return true;
      }
    })
  ) {
    errors.push('ALLOWED_ORIGINS must contain exact HTTP(S) origins');
  }
  const ttl = environment.SESSION_TTL_SECONDS ?? '28800';
  const lifetime =
    typeof ttl === 'string' && /^\d+$/.test(ttl) ? Number(ttl) : NaN;
  if (!Number.isInteger(lifetime) || lifetime < 60 || lifetime > 604800) {
    errors.push('SESSION_TTL_SECONDS must be an integer from 60 to 604800');
  }
  const rawSecure =
    environment.COOKIE_SECURE ??
    (environment.NODE_ENV === 'production' ? 'true' : 'false');
  if (
    !['true', 'false'].includes(rawSecure as string) ||
    (environment.NODE_ENV === 'production' && rawSecure !== 'true')
  ) {
    errors.push('COOKIE_SECURE must be true or false and true in production');
  }
  const prefix = environment.REDIS_KEY_PREFIX ?? 'fielddesk';
  if (typeof prefix !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(prefix)) {
    errors.push('REDIS_KEY_PREFIX must be a safe nonempty namespace');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer from 1 to 65535');
  }

  const databaseUrl = environment.DATABASE_URL;
  const redisUrl = environment.REDIS_URL;
  const validDatabaseUrl = isServiceUrl(databaseUrl, [
    'postgresql:',
    'postgres:',
  ]);
  const validRedisUrl = isServiceUrl(redisUrl, ['redis:', 'rediss:']);

  if (!validDatabaseUrl) {
    errors.push('DATABASE_URL must be a PostgreSQL URL with a host');
  }
  if (!validRedisUrl) {
    errors.push('REDIS_URL must be a Redis URL with a host');
  }
  if (errors.length > 0 || !validDatabaseUrl || !validRedisUrl) {
    throw new Error(`Invalid API configuration: ${errors.join('; ')}`);
  }

  return {
    PORT: port,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    ALLOWED_ORIGINS: origins,
    SESSION_TTL_SECONDS: lifetime,
    COOKIE_SECURE: rawSecure === 'true',
    REDIS_KEY_PREFIX: prefix as string,
  };
}
