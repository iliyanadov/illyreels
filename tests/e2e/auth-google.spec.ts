import { test, expect } from '@playwright/test';

test.describe('Google Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display Connect Google button when not connected', async ({ page }) => {
    const connectButton = page.getByText('Connect Google');
    await expect(connectButton).toBeVisible();
  });

  test('should redirect to Google OAuth on connect click', async ({ page }) => {
    // Mock the OAuth URL response
    await page.route('**/api/google/auth', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&redirect_uri=test',
        }),
      });
    });

    await page.getByText('Connect Google').click();

    // Verify the OAuth URL was fetched
    const authRequest = page.waitForResponse('**/api/google/auth');
    await authRequest;
  });

  test('should show connected state after successful OAuth', async ({ page }) => {
    // Set the Google token cookie directly (simulating successful OAuth)
    const googleToken = Buffer.from(
      JSON.stringify({
        accessToken: 'ya29.test_token',
        refreshToken: '1//test_refresh',
      })
    ).toString('base64');

    await page.context().addCookies([
      {
        name: 'google_token',
        value: googleToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock the /api/google/me endpoint
    await page.route('**/api/google/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: true }),
      });
    });

    await page.reload();

    // Should show connected state
    await expect(page.getByText('Connected to Google Sheets')).toBeVisible();
  });

  test('should show Import from Sheets button when connected', async ({ page }) => {
    // Set the Google token cookie
    const googleToken = Buffer.from(
      JSON.stringify({
        accessToken: 'ya29.test_token',
        refreshToken: '1//test_refresh',
      })
    ).toString('base64');

    await page.context().addCookies([
      {
        name: 'google_token',
        value: googleToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock the /api/google/me endpoint
    await page.route('**/api/google/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: true }),
      });
    });

    await page.reload();

    await expect(page.getByText('Import from Sheets')).toBeVisible();
  });

  test('should disconnect and clear connection state', async ({ page }) => {
    // Set the Google token cookie
    const googleToken = Buffer.from(
      JSON.stringify({
        accessToken: 'ya29.test_token',
        refreshToken: '1//test_refresh',
      })
    ).toString('base64');

    await page.context().addCookies([
      {
        name: 'google_token',
        value: googleToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock the endpoints
    await page.route('**/api/google/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: true }),
      });
    });

    await page.route('**/api/google/disconnect', async route => {
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
    await expect(page.getByText('Connect Google')).toBeVisible();
  });

  test('should handle OAuth error callback', async ({ page }) => {
    // Navigate with error parameter
    await page.goto('/?google_error=access_denied');

    // Should show error state or return to login
    const connectButton = page.getByText('Connect Google');
    await expect(connectButton).toBeVisible();
  });
});
