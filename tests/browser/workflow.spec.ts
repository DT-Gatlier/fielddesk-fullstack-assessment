import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { prisma } from '../../api/src/db';

const browserReference = `BROWSER-${randomUUID().slice(0, 8)}`;
let browserCustomerId: string | undefined;
test.afterAll(async () => {
  const jobs = await prisma.job.findMany({ where: { referenceNumber: { startsWith: browserReference } }, select: { id: true } });
  const jobIds = jobs.map(job => job.id);
  await prisma.auditLog.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  if (browserCustomerId) {
    await prisma.auditLog.deleteMany({ where: { targetId: browserCustomerId, targetType: 'customer' } });
    await prisma.customer.delete({ where: { id: browserCustomerId } });
  }
  await prisma.$disconnect();
});

test('dispatcher signs in, finds a persisted work order and opens its details', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill('raju@lakshmi.test');
  await page.getByLabel('Password', { exact: true }).fill('FieldDesk123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByRole('textbox', { name: 'Search work orders' }).fill('FD-1001');
  const row = page.getByRole('row').filter({ hasText: 'FD-1001' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'View FD-1001' }).click();
  await expect(page.getByRole('heading', { name: 'HVAC inspection' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Activity history' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work-order history' })).toBeVisible();
});

test('dispatcher creates, edits and exports a persisted work order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New work order' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Reference number').fill(browserReference);
  await form.getByLabel('Customer', { exact: true }).selectOption({ label: 'Sree Lakshmi Services Customer' });
  await form.getByLabel('Work order title').fill('Browser verified repair');
  await form.getByLabel('Description').fill('Created through the browser and persisted through the API.');
  await form.getByRole('button', { name: 'Create work order' }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByLabel('Search work orders').fill(browserReference);
  await page.getByRole('button', { name: `Edit ${browserReference}` }).click();
  await form.getByLabel('Work order title').fill('Updated browser repair');
  await form.getByLabel('Priority', { exact: true }).selectOption('URGENT');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByLabel('Search work orders').fill(browserReference);
  await expect(page.getByRole('row').filter({ hasText: browserReference })).toContainText('Updated browser repair');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, 'utf8')).toContain('Updated browser repair');
});

test('dispatcher can reach scheduling, reporting and delivery history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByLabel('Schedule date')).toBeVisible();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter by priority')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assignment notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Activity history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organisation activity' })).toBeVisible();
});

test('owner can open team management while technician has only assigned-work actions', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill('aiswarya@lakshmi.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Team & settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Team and settings' })).toBeVisible();
  await expect(page.getByLabel('Organisation name')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('button.profile').click();
  await page.getByLabel('Email address').fill('kamal@lakshmi.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New work order' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Team & settings' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByLabel('Search work orders').fill('FD-1001');
  await page.getByRole('button', { name: 'View FD-1001' }).click();
  await page.getByRole('button', { name: 'Add progress' }).click();
  await expect(page.getByLabel('Update status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit / assign / reschedule' })).toHaveCount(0);
});

test('dispatcher adds a customer and creates a work order without a seeded customer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New work order' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add customer', exact: true }).click();
  const customerForm = page.getByRole('form', { name: 'New customer' });
  await customerForm.getByLabel('Customer name', { exact: true }).fill('Meera Apartments');
  await customerForm.getByLabel('Customer address').fill('12 Temple Road');
  await customerForm.getByLabel('Customer phone').fill('9876543210');
  const createdResponse = page.waitForResponse(response => response.url().endsWith('/api/customers') && response.request().method() === 'POST');
  await customerForm.getByRole('button', { name: 'Save customer' }).click();
  browserCustomerId = (await (await createdResponse).json()).customer.id;
  await expect(customerForm).toHaveCount(0);
  await expect(dialog.getByLabel('Customer', { exact: true })).toHaveValue(browserCustomerId!);
  await dialog.getByLabel('Reference number').fill(`${browserReference}-NEW`);
  await dialog.getByLabel('Work order title').fill('Repair apartment water pump');
  await dialog.getByLabel('Description').fill('Inspect and repair the shared water pump.');
  await dialog.getByRole('button', { name: 'Create work order', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByLabel('Search work orders').fill(`${browserReference}-NEW`);
  await expect(page.getByRole('row').filter({ hasText: `${browserReference}-NEW` })).toContainText('Meera Apartments');
});

test('mobile navigation exposes the work-order workflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await expect(page.getByLabel('Search work orders')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New work order' })).toBeVisible();
});
