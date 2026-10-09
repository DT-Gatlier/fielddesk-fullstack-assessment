import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { selectTheme } from './helpers/theme';

test('profile login interactions without remounting static branding', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    browserName !== 'chromium',
    'CDP performance counters are Chromium-specific',
  );
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  const branding = await page.locator('aside').elementHandle();
  if (!branding) throw new Error('Missing desktop branding');
  const observation = await branding.evaluateHandle((element) => {
    let mutations = 0;
    const observer = new MutationObserver((records) => {
      mutations += records.length;
    });
    observer.observe(element, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
    return { read: () => mutations, stop: () => observer.disconnect() };
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const results: Record<string, Record<string, number>> = {};
  let previous = (await session.send('Performance.getMetrics')).metrics;
  async function record(name: string) {
    const current = (await session.send('Performance.getMetrics')).metrics;
    results[name] = Object.fromEntries(
      [
        'TaskDuration',
        'ScriptDuration',
        'LayoutDuration',
        'RecalcStyleDuration',
      ].map((key) => [
        key,
        ((current.find((metric) => metric.name === key)?.value ?? 0) -
          (previous.find((metric) => metric.name === key)?.value ?? 0)) *
          1000,
      ]),
    );
    previous = current;
  }
  await page.getByLabel('Email address').pressSequentially('draft@example.com');
  await page
    .getByLabel('Password', { exact: true })
    .pressSequentially('Unsubmitted password');
  await record('typing');
  await page.getByRole('button', { name: 'Show password' }).click();
  await page.getByRole('button', { name: 'Hide password' }).click();
  await record('visibility');
  await selectTheme(page, 'dark');
  await record('theme');
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith('/auth/me') && item.request().method() === 'GET',
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await response;
  await expect(page.getByRole('status')).toBeEmpty();
  await record('session-recheck');
  expect(await branding.evaluate((element) => element.isConnected)).toBe(true);
  expect(await observation.evaluate((value) => value.read())).toBe(0);
  await observation.evaluate((value) => value.stop());
  const path = info.outputPath('interaction-profile-ms.json');
  await writeFile(path, JSON.stringify(results, null, 2));
  await info.attach('interaction-profile-ms', {
    path,
    contentType: 'application/json',
  });
  await session.detach();
});
