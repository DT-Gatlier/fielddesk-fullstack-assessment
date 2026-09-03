# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: owner-dashboard.spec.ts >> Owner Dashboard >> can invite a new user
- Location: e2e\owner-dashboard.spec.ts:50:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Invite User' })
    - locator resolved to <button class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-3 gap-2">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [ref=e7]:
  - generic [ref=e8]:
    - heading "Sign in" [level=3] [ref=e9]
    - paragraph [ref=e10]: Access your FieldDesk dispatcher terminal.
  - generic [ref=e12]:
    - generic [ref=e13]:
      - text: Email address
      - textbox "Email address" [ref=e14]:
        - /placeholder: name@example.com
    - generic [ref=e15]:
      - generic [ref=e16]: Password
      - textbox "Password" [ref=e18]
    - button "Log In" [ref=e19] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const mockQuota = {
  4  |   storage_used_bytes: 50 * 1024 * 1024,
  5  |   storage_quota_bytes: 100 * 1024 * 1024
  6  | };
  7  | 
  8  | const mockUsers = [
  9  |   { id: '1', email: 'owner@test.com', role: 'owner' },
  10 |   { id: '2', email: 'tech@test.com', role: 'technician' }
  11 | ];
  12 | 
  13 | test.describe('Owner Dashboard', () => {
  14 |   test.beforeEach(async ({ page }) => {
  15 |     // Mock the APIs
  16 |     await page.route('**/work-orders?status=open&pageSize=1', async route => {
  17 |       await route.fulfill({ json: { total: 10, data: [] } });
  18 |     });
  19 |     await page.route('**/work-orders?status=completed&pageSize=1', async route => {
  20 |       await route.fulfill({ json: { total: 25, data: [] } });
  21 |     });
  22 |     await page.route('**/organisation/quota', async route => {
  23 |       await route.fulfill({ json: mockQuota });
  24 |     });
  25 |     await page.route('**/users', async route => {
  26 |       if (route.request().method() === 'GET') {
  27 |         await route.fulfill({ json: mockUsers });
  28 |       } else {
  29 |         await route.continue();
  30 |       }
  31 |     });
  32 | 
  33 |     // Mock token for owner role
  34 |     await page.addInitScript(() => {
  35 |       window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJlbWFpbCI6Im93bmVyQHRlc3QuY29tIiwicm9sZSI6Im93bmVyIiwib3JnX2lkIjoiNDU2In0.signature');
  36 |     });
  37 | 
  38 |     await page.goto('/owner');
  39 |   });
  40 | 
  41 |   test('displays summary cards and progress bar', async ({ page }) => {
  42 |     await expect(page.getByTestId('count-open')).toHaveText('10');
  43 |     await expect(page.getByTestId('count-completed')).toHaveText('25');
  44 |     
  45 |     await expect(page.getByText('Storage Quota')).toBeVisible();
  46 |     await expect(page.getByTestId('progress-bar')).toBeVisible();
  47 |     await expect(page.getByText('50 MB / 100 MB used')).toBeVisible();
  48 |   });
  49 | 
  50 |   test('can invite a new user', async ({ page }) => {
  51 |     // Mock the POST request for invite
  52 |     await page.route('**/users', async route => {
  53 |       if (route.request().method() === 'POST') {
  54 |         const payload = JSON.parse(route.request().postData() || '{}');
  55 |         await route.fulfill({ json: { id: '3', email: payload.email, role: payload.role }, status: 201 });
  56 |       } else {
  57 |         await route.continue();
  58 |       }
  59 |     });
  60 | 
  61 |     await expect(page.getByText('owner@test.com')).toBeVisible();
  62 | 
> 63 |     await page.getByRole('button', { name: 'Invite User' }).click();
     |                                                             ^ Error: locator.click: Test timeout of 30000ms exceeded.
  64 |     
  65 |     // Fill the modal form
  66 |     await page.getByLabel('Email address').fill('newtech@test.com');
  67 |     await page.getByLabel('Role').selectOption('technician');
  68 |     
  69 |     await page.getByRole('button', { name: 'Send Invite' }).click();
  70 | 
  71 |     await expect(page.getByLabel('Email address')).toBeHidden();
  72 |   });
  73 | 
  74 |   test('can export csv', async ({ page }) => {
  75 |     // Mock CSV export response
  76 |     await page.route('**/work-orders/export', async route => {
  77 |       await route.fulfill({ 
  78 |         body: 'id,title\n1,Test',
  79 |         headers: {
  80 |           'Content-Type': 'text/csv',
  81 |         }
  82 |       });
  83 |     });
  84 | 
  85 |     // Start waiting for download before clicking. Note no await.
  86 |     const downloadPromise = page.waitForEvent('download');
  87 |     await page.getByRole('button', { name: 'Export CSV' }).click();
  88 |     
  89 |     const download = await downloadPromise;
  90 |     expect(download.suggestedFilename()).toMatch(/work_orders_.*\.csv/);
  91 |   });
  92 | });
  93 | 
```