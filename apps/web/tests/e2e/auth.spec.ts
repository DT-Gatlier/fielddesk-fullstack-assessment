import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { selectTheme } from './helpers/theme';

const api = 'http://localhost:3101';
const first = {
  email: 'arjun.nair@clearbrook.org',
  name: 'Arjun Nair',
  company: 'Clearbrook Maintenance',
};
const second = {
  email: 'ananya.iyer@oakridge.org',
  name: 'Ananya Iyer',
  company: 'Oakridge Property Services',
};
async function signIn(page: Page, email = first.email): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Demo2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
}

test('direct protected visit, real login, refresh, logout and another tenant', async ({
  page,
  context,
}) => {
  await page.goto('/dashboard?view=assigned');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.getByLabel('Email address').fill(first.email);
  await page.getByLabel('Password', { exact: true }).fill('Demo2026');
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url() === `${api}/api/v1/auth/login` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/dashboard?view=assigned');
  expect((await (await loginResponse).allHeaders())['set-cookie']).toMatch(
    /SameSite=Lax/i,
  );
  await expect(
    page.getByRole('heading', { name: `Welcome, ${first.name}` }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (item) => item.name === 'fielddesk_session',
  );
  expect(cookie).toMatchObject({
    httpOnly: true,
    path: '/api/v1',
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: `Welcome, ${first.name}` }),
  ).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(
    (await context.cookies()).some((item) => item.name === 'fielddesk_session'),
  ).toBe(false);
  await signIn(page, second.email);
  await expect(
    page.getByRole('heading', { name: `Welcome, ${second.name}` }),
  ).toBeVisible();
  await expect(page.getByText(first.company, { exact: true })).toHaveCount(0);
  await expect(page.getByText(first.email, { exact: true })).toHaveCount(0);
});

test('validation and failed credentials do not enter protected content', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Enter your password.')).toBeVisible();
  await page.getByLabel('Email address').fill(first.email);
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Invalid email or password.' }),
  ).toHaveText('Invalid email or password.');
  await expect(page.getByLabel('Email address')).toHaveValue(first.email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\/login/);
});

test('revoked session is rejected on reload and stale-cookie logout recovers', async ({
  page,
  context,
}) => {
  await signIn(page);
  const originalCookie = (await context.cookies()).find(
    (cookie) => cookie.name === 'fielddesk_session',
  );
  expect(originalCookie).toBeDefined();
  const csrf = await context.request.get(`${api}/api/v1/auth/csrf`);
  const body: { csrfToken: string } = await csrf.json();
  const result = await context.request.post(`${api}/api/v1/auth/logout`, {
    headers: {
      Origin: 'http://localhost:3100',
      'X-CSRF-Token': body.csrfToken,
    },
  });
  expect(result.status()).toBe(204);
  if (!originalCookie) throw new Error('Missing test session cookie');
  await context.addCookies([originalCookie]);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  // Replace the cookie with an invalid token while the rendered tab still has identity.
  await context.addCookies([
    {
      name: 'fielddesk_session',
      value: 'expired-session-token',
      domain: 'localhost',
      path: '/api/v1',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(
    (await context.cookies()).some((item) => item.name === 'fielddesk_session'),
  ).toBe(false);
});

test('cross-tab logout hides the previous identity', async ({
  page,
  context,
}) => {
  await signIn(page);
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(
    other.getByRole('heading', { name: `Welcome, ${first.name}` }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(other).toHaveURL(/\/login/);
  await expect(other.getByText(first.email, { exact: true })).toHaveCount(0);
});

test('a delayed identity response cannot restore a logged-out tab', async ({
  page,
  context,
}) => {
  await signIn(page, second.email);
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(
    other.getByRole('heading', { name: `Welcome, ${second.name}` }),
  ).toBeVisible();
  let release: () => void = () => {};
  let started: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    started = resolve;
  });
  await other.route(
    `${api}/api/v1/auth/me`,
    async (route) => {
      const response = await route.fetch();
      started();
      await waiting;
      await route.fulfill({ response }).catch(() => {});
    },
    { times: 1 },
  );
  const reload = other.reload();
  await reached;
  await page.getByRole('button', { name: 'Sign out' }).click();
  release();
  await reload;
  await expect(other).toHaveURL(/\/login/);
  await expect(other.getByText(second.email, { exact: true })).toHaveCount(0);
});

test('rate limits are shown without automatic credential retries', async ({
  page,
}) => {
  let attempts = 0;
  await page.route(`${api}/api/v1/auth/login`, (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    attempts += 1;
    return route.fulfill({
      status: 429,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'Retry-After',
        'Retry-After': '45',
      },
      json: {
        code: 'RATE_LIMITED',
        message: 'Too many login attempts',
        requestId: 'controlled-rate-limit',
      },
    });
  });
  await page.goto('/login');
  await page.getByLabel('Email address').fill(first.email);
  await page.getByLabel('Password', { exact: true }).fill('Demo2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Too many attempts.' }),
  ).toContainText('45 seconds');
  expect(attempts).toBe(1);
});

test('unavailable session has retry state and recovers', async ({ page }) => {
  await page.route(`${api}/api/v1/auth/me`, (route) =>
    route.fulfill({
      status: 503,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
      },
      json: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' },
    }),
  );
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Unable to load your session' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/dashboard');
  await page.unroute(`${api}/api/v1/auth/me`);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('failed logout retains the session and allows retry', async ({ page }) => {
  await signIn(page, second.email);
  await page.route(`${api}/api/v1/auth/logout`, (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    return route.fulfill({
      status: 503,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
      },
      json: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' },
    });
  });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'temporarily unavailable' }),
  ).toContainText('temporarily unavailable');
  await expect(
    page.getByRole('heading', { name: `Welcome, ${second.name}` }),
  ).toBeVisible();
  await page.unroute(`${api}/api/v1/auth/logout`);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('an expired database session is hidden on reload', async ({
  page,
  context,
}) => {
  await signIn(page, 'rahul.sharma@clearbrook.org');
  const cookie = (await context.cookies()).find(
    (item) => item.name === 'fielddesk_session',
  );
  if (!cookie) throw new Error('Missing isolated test fixture configuration');
  const databaseDirectory = resolve(process.cwd(), '../../packages/database');
  const databaseRequire = createRequire(
    resolve(databaseDirectory, 'package.json'),
  );
  execFileSync(
    process.execPath,
    [databaseRequire.resolve('tsx/cli'), 'scripts/expire-web-test-session.ts'],
    {
      env: { ...process.env, E2E_SESSION_TOKEN: cookie.value },
      cwd: databaseDirectory,
      stdio: 'pipe',
    },
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText('rahul.sharma@clearbrook.org', { exact: true }),
  ).toHaveCount(0);
});

test('browser recovers an identified CSRF rejection and rotates protection after login', async ({
  page,
}) => {
  let attempts = 0;
  const tokens: string[] = [];
  page.on('response', (response) => {
    if (response.url() === `${api}/api/v1/auth/csrf` && response.ok()) {
      void response
        .json()
        .then((body: { csrfToken: string }) => tokens.push(body.csrfToken));
    }
  });
  await page.route(`${api}/api/v1/auth/login`, (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    attempts += 1;
    if (attempts === 1)
      return route.continue({
        headers: {
          ...route.request().headers(),
          'x-csrf-token': 'invalid-test-token',
        },
      });
    return route.continue();
  });
  await signIn(page, 'meera.menon@clearbrook.org');
  expect(attempts).toBe(2);
  expect(tokens.length).toBeGreaterThanOrEqual(3);
  expect(tokens.at(-1)).not.toBe(tokens[0]);
  await expect(page.getByText('Dispatcher', { exact: true })).toHaveCount(2);
});

test('light, dark and system themes persist and respond to device changes', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  const toggle = page.getByRole('button', { name: 'Toggle theme' });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(
    page.getByRole('menuitem', { name: 'Light', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await selectTheme(page, 'light');
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.screenshot({
    path: testInfo.outputPath('login-light.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/light/);
  expect(
    await page.evaluate(() => localStorage.getItem('fielddesk-theme')),
  ).toBe('light');
  await selectTheme(page, 'dark');
  await page.screenshot({
    path: testInfo.outputPath('login-dark.png'),
    fullPage: true,
  });
  await selectTheme(page, 'system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass(/light/);
  expect(errors).toEqual([]);
});

test('mobile login and shell support keyboard use in both themes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Email address').fill(second.email);
  await page.getByLabel('Email address').press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.type('Demo2026');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Show password' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: `Welcome, ${second.name}` }),
  ).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await selectTheme(page, theme);
    await expect(page.locator('html')).toHaveClass(new RegExp(theme));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`shell-mobile-${theme}.png`),
      fullPage: true,
    });
  }
});
