import { test, expect } from '@playwright/test';

const mockQuota = {
  storage_used_bytes: 50 * 1024 * 1024,
  storage_quota_bytes: 100 * 1024 * 1024
};

const mockUsers = [
  { id: '1', email: 'owner@test.com', role: 'owner' },
  { id: '2', email: 'tech@test.com', role: 'technician' }
];

test.describe('Owner Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the APIs
    await page.route('**/work-orders?status=open&pageSize=1', async route => {
      await route.fulfill({ json: { total: 10, data: [] } });
    });
    await page.route('**/work-orders?status=completed&pageSize=1', async route => {
      await route.fulfill({ json: { total: 25, data: [] } });
    });
    await page.route('**/organisation/quota', async route => {
      await route.fulfill({ json: mockQuota });
    });
    await page.route('**/users', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: mockUsers });
      } else {
        await route.continue();
      }
    });

    // Mock token for owner role
    await page.addInitScript(() => {
      window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJlbWFpbCI6Im93bmVyQHRlc3QuY29tIiwicm9sZSI6Im93bmVyIiwib3JnX2lkIjoiNDU2In0.signature');
    });

    await page.goto('/owner');
  });

  test('displays summary cards and progress bar', async ({ page }) => {
    await expect(page.getByTestId('count-open')).toHaveText('10');
    await expect(page.getByTestId('count-completed')).toHaveText('25');
    
    await expect(page.getByText('Storage Quota')).toBeVisible();
    await expect(page.getByTestId('progress-bar')).toBeVisible();
    await expect(page.getByText('50 MB / 100 MB used')).toBeVisible();
  });

  test('can invite a new user', async ({ page }) => {
    // Mock the POST request for invite
    await page.route('**/users', async route => {
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({ json: { id: '3', email: payload.email, role: payload.role }, status: 201 });
      } else {
        await route.continue();
      }
    });

    await expect(page.getByText('owner@test.com')).toBeVisible();

    await page.getByRole('button', { name: 'Invite User' }).click();
    
    // Fill the modal form
    await page.getByLabel('Email address').fill('newtech@test.com');
    await page.getByLabel('Role').selectOption('technician');
    
    await page.getByRole('button', { name: 'Send Invite' }).click();

    await expect(page.getByLabel('Email address')).toBeHidden();
  });

  test('can export csv', async ({ page }) => {
    // Mock CSV export response
    await page.route('**/work-orders/export', async route => {
      await route.fulfill({ 
        body: 'id,title\n1,Test',
        headers: {
          'Content-Type': 'text/csv',
        }
      });
    });

    // Start waiting for download before clicking. Note no await.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/work_orders_.*\.csv/);
  });
});
