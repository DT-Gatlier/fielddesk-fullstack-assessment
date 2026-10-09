import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectTheme } from './helpers/theme';
const api = 'http://localhost:3101/api/v1/auth';
const cors = {
  'Access-Control-Allow-Origin': 'http://localhost:3100',
  'Access-Control-Allow-Credentials': 'true',
};

test('background focus and reconnect checks preserve form identity, values and selection', async ({
  page,
}) => {
  let sessionReads = 0;
  page.on('request', (request) => {
    if (request.url() === `${api}/me` && request.method() === 'GET')
      sessionReads++;
  });
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  expect(sessionReads).toBe(1);
  const email = page.getByLabel('Email address');
  const password = page.getByLabel('Password', { exact: true });
  await email.fill('draft@example.com');
  await password.fill('Unsubmitted password');
  await password.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(3, 7);
    element.dataset.original = 'yes';
  });
  for (const trigger of ['focus', 'reconnect']) {
    let release: () => void = () => {};
    let started: () => void = () => {};
    const reached = new Promise<void>((resolve) => {
      started = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      `${api}/me`,
      async (route) => {
        started();
        await waiting;
        await route.fulfill({
          status: 401,
          headers: cors,
          json: { code: 'UNAUTHORIZED' },
        });
      },
      { times: 1 },
    );
    await page.evaluate((kind) => {
      if (kind === 'focus') {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        window.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        window.dispatchEvent(new Event('visibilitychange'));
        Reflect.deleteProperty(document, 'visibilityState');
      } else {
        window.dispatchEvent(new Event('offline'));
        window.dispatchEvent(new Event('online'));
      }
    }, trigger);
    await reached;
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute('data-original', 'yes');
    await expect(password).toHaveValue('Unsubmitted password');
    expect(
      await password.evaluate((element: HTMLInputElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([3, 7]);
    release();
    await expect(page.getByRole('status')).toBeEmpty();
    await expect(email).toHaveValue('draft@example.com');
  }
});

test('unavailable background verification retains the form and recovers safely', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Email address').fill('draft@example.com');
  await page.route(`${api}/me`, (route) =>
    route.fulfill({
      status: 503,
      headers: cors,
      json: { code: 'SERVICE_UNAVAILABLE' },
    }),
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'Unable to load your session' }),
  ).toContainText('Unable to load your session');
  await expect(page.getByLabel('Email address')).toHaveValue(
    'draft@example.com',
  );
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeDisabled();
  await page.unroute(`${api}/me`);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Email address')).toHaveValue(
    'draft@example.com',
  );
});

test('password visibility preserves value and caret; validation focuses the first invalid field', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Email address')).toBeFocused();
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('Secret value');
  await password.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 5),
  );
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toBeFocused();
  await expect(password).toHaveValue('Secret value');
  expect(
    await password.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([2, 5]);
  await expect(
    page.getByRole('button', { name: 'Hide password' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('a failed submission produces one toast and prevents duplicate requests', async ({
  page,
}) => {
  let attempts = 0;
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${api}/login`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    attempts++;
    await waiting;
    await route.fulfill({
      status: 503,
      headers: cors,
      json: { code: 'SERVICE_UNAVAILABLE' },
    });
  });
  await page.goto('/login');
  await page.getByLabel('Email address').fill('draft@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Secret value');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Signing in' })).toBeDisabled();
  await page
    .locator('form')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  release();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1);
  await expect(page.locator('[data-sonner-toast]')).toContainText(
    'temporarily unavailable',
  );
  expect(attempts).toBe(1);
  await page.getByRole('button', { name: 'Close toast' }).click();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
  { width: 1280, height: 500 },
]) {
  test(`accessible responsive login ${size.width}x${size.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    await page.goto('/login');
    for (const theme of ['light', 'dark']) {
      await selectTheme(page, theme);
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
      ).toBeEnabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page
        .getByLabel('Password', { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByLabel('Password', { exact: true }),
      ).toBeInViewport();
      await page
        .getByRole('button', { name: 'Sign in', exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`login-${theme}.png`),
        fullPage: true,
      });
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
