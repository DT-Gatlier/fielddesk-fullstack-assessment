import { test, expect } from '@playwright/test';

const mockWorkOrders = {
  data: [
    {
      id: '1',
      title: 'Fix AC Unit',
      description: 'The AC unit is blowing warm air.',
      status: 'assigned',
      created_at: '2023-10-01T10:00:00Z',
      priority: 'high'
    },
    {
      id: '2',
      title: 'Repair Plumbing',
      description: 'Leak in the kitchen sink.',
      status: 'in_progress',
      created_at: '2023-10-02T11:00:00Z',
      priority: 'medium'
    },
    {
      id: '3',
      title: 'Electrical Inspection',
      description: 'Annual inspection.',
      status: 'completed',
      created_at: '2023-10-03T12:00:00Z',
      priority: 'low'
    }
  ]
};

test.describe('Technician Feed', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the work orders API
    await page.route('**/work-orders', async route => {
      const json = mockWorkOrders;
      await route.fulfill({ json });
    });
    
    // We assume the route to the technician feed is /technician
    // We might also need to set a mock token if there's a route guard
    await page.addInitScript(() => {
      window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJlbWFpbCI6InRlY2hAdGVzdC5jb20iLCJyb2xlIjoidGVjaG5pY2lhbiIsIm9yZ19pZCI6IjQ1NiJ9.signature');
    });

    await page.goto('/technician');
  });

  test('displays essential work order details', async ({ page }) => {
    // Title
    await expect(page.getByText('Fix AC Unit').first()).toBeVisible();
    await expect(page.getByText('Repair Plumbing').first()).toBeVisible();
    
    // Priority and Status
    await expect(page.getByText('high').first()).toBeVisible();
    await expect(page.getByText('assigned').first()).toBeVisible();
  });

  test('layout transitions from single column on mobile to multi-column on desktop', async ({ page, isMobile }) => {
    // Wait for the grid container to be visible
    const grid = page.getByTestId('technician-feed-grid');
    await expect(grid).toBeVisible();

    // Check if cards are present
    const cards = grid.locator('.rounded-xl'); // The shadcn Card component uses rounded-xl
    // Wait for cards to render
    await expect(cards).toHaveCount(3);

    const firstCard = await cards.nth(0).boundingBox();
    const secondCard = await cards.nth(1).boundingBox();

    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();

    if (isMobile) {
      // On mobile, the second card should be strictly below the first card
      expect(secondCard!.y).toBeGreaterThan(firstCard!.y + firstCard!.height * 0.5);
      // And they should start at the same x position
      expect(Math.abs(secondCard!.x - firstCard!.x)).toBeLessThan(10);
    } else {
      // On desktop, the second card should be to the right of the first card
      expect(secondCard!.x).toBeGreaterThan(firstCard!.x + firstCard!.width * 0.5);
      // And they should start at the roughly the same y position
      expect(Math.abs(secondCard!.y - firstCard!.y)).toBeLessThan(20);
    }
  });
});
