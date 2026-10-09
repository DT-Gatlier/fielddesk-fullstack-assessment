import type { Page } from '@playwright/test';

export async function selectTheme(page: Page, theme: string) {
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page
    .getByRole('menuitem', {
      name: theme.charAt(0).toUpperCase() + theme.slice(1),
      exact: true,
    })
    .click();
}
