import { test, expect } from '@playwright/test';

test.describe('Instagram Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display Connect Instagram button when not connected', async ({ page }) => {
    const connectButton = page.getByText('Connect Instagram');
    await expect(connectButton).toBeVisible();
  });

  test('should redirect to Instagram OAuth on connect click', async ({ page }) => {
    // Mock the OAuth URL response
    await page.route('**/api/meta/auth', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://www.instagram.com/oauth/authorize?client_id=test',
          state: 'test-state-uuid',
        }),
      });
    });

    await page.getByText('Connect Instagram').click();

    // Verify the OAuth URL was fetched
    const authRequest = page.waitForResponse('**/api/meta/auth');
    await authRequest;
  });

  test('should show username after successful connection', async ({ page }) => {
    // Set the Instagram token cookie
    const metaToken = Buffer.from(
      JSON.stringify({
        userAccessToken: 'IGQVJWtest_token',
        igUserId: '17841400123456789',
        igUsername: 'testuser_business',
        expiresAt: Math.floor(Date.now() / 1000) + 5184000,
      })
    ).toString('base64');

    await page.context().addCookies([
      {
        name: 'meta_token',
        value: metaToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock the /api/meta/me endpoint
    await page.route('**/api/meta/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '17841400123456789',
          username: 'testuser_business',
          accountType: 'MEDIA_CREATOR',
        }),
      });
    });

    // Mock the publishing limit endpoint
    await page.route('**/api/meta/publishing-limit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: { quota_total: 25 },
          quota_usage: 3,
        }),
      });
    });

    await page.reload();

    // Should show username
    await expect(page.getByText('@testuser_business')).toBeVisible();
  });

  test('should show PublishingLimit component after connection', async ({ page }) => {
    // Set the Instagram token cookie
    const metaToken = Buffer.from(
      JSON.stringify({
        userAccessToken: 'IGQVJWtest_token',
        igUserId: '17841400123456789',
        igUsername: 'testuser_business',
        expiresAt: Math.floor(Date.now() / 1000) + 5184000,
      })
    ).toString('base64');

    await page.context().addCookies([
      {
        name: 'meta_token',
        value: metaToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock the endpoints
    await page.route('**/api/meta/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '17841400123456789',
          username: 'testuser_business',
          accountType: 'MEDIA_CREATOR',
        }),
      });
    });

    await page.route('**/api/meta/publishing-limit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: { quota_total: 25 },
          quota_usage: 3,
        }),
      });
    });

    await page.reload();

    // Should show publishing limit
    await expect(page.getByText(/posts used today/i)).toBeVisible();
    await expect(page.getByText('3 / 25')).toBeVisible();
  });

  test('should disconnect and clear connection state', async ({ page }) => {
    // Set the Instagram token cookie
    const metaToken = Buffer.from(
      JSON.stringify({
        userAccessToken: 'IGQVJWtest_token',
        igUserId: '17841400123456789',
        igUsername: 'testuser_business',
        expiresAt: Math.floor(Date.now() / 1000) + 5184000,
      })
    ).toString('base64');

    await page.context().addCookies([
      {
        name: 'meta_token',
        value: metaToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock the endpoints
    await page.route('**/api/meta/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '17841400123456789',
          username: 'testuser_business',
          accountType: 'MEDIA_CREATOR',
        }),
      });
    });

    await page.route('**/api/meta/disconnect', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.reload();

    // Click disconnect button
    await page.getByText('Disconnect').click();

    // Should return to initial state
    await expect(page.getByText('Connect Instagram')).toBeVisible();
  });

  test('should handle OAuth error callback', async ({ page }) => {
    // Navigate with error parameter
    await page.goto('/?meta_error=access_denied');

    // Should show error state or return to login
    const connectButton = page.getByText('Connect Instagram');
    await expect(connectButton).toBeVisible();
  });

  test('should handle different account types', async ({ page }) => {
    // Set the Instagram token cookie
    const metaToken = Buffer.from(
      JSON.stringify({
        userAccessToken: 'IGQVJWtest_token',
        igUserId: '17841400123456789',
        igUsername: 'testuser_business',
        expiresAt: Math.floor(Date.now() / 1000) + 5184000,
      })
    ).toString('base64');

    await page.context().addCookies([
      {
        name: 'meta_token',
        value: metaToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock with BUSINESS account type
    await page.route('**/api/meta/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '17841400123456789',
          username: 'testuser_business',
          accountType: 'BUSINESS',
        }),
      });
    });

    await page.route('**/api/meta/publishing-limit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: { quota_total: 25 },
          quota_usage: 3,
        }),
      });
    });

    await page.reload();

    // Should show connected state for BUSINESS account
    await expect(page.getByText('@testuser_business')).toBeVisible();
  });
});
