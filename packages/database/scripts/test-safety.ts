import { requireDatabaseUrl } from './environment';

function target(value: string | undefined): {
  host: string;
  port: string;
  database: string;
} {
  const url = new URL(requireDatabaseUrl(value));
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(
    url.hostname.toLowerCase(),
  )
    ? 'loopback'
    : url.hostname.toLowerCase();
  return {
    host,
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

export function assertSafeTestDatabase(
  testUrl: string | undefined,
  developmentUrl: string | undefined,
): string {
  const test = target(testUrl);
  const development = target(developmentUrl);
  if (
    test.database !== 'fielddesk_test' ||
    test.host !== development.host ||
    test.port !== development.port ||
    test.database === development.database
  ) {
    throw new Error(
      'Unsafe test database target: expected fielddesk_test on the development server, distinct from the development database',
    );
  }
  return testUrl as string;
}
