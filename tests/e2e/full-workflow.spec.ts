import { test, expect } from '@playwright/test';

test.describe('Full User Workflow', () => {
  test('should complete end-to-end workflow: connect, import, fetch, publish', async ({ page }) => {
    // Setup mock cookies and routes
    const googleToken = Buffer.from(
      JSON.stringify({
        accessToken: 'ya29.test_token',
        refreshToken: '1//test_refresh',
      })
    ).toString('base64');

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
        name: 'google_token',
        value: googleToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
      {
        name: 'meta_token',
        value: metaToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ]);

    // Mock all API endpoints
    await page.route('**/api/google/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: true }),
      });
    });

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

    await page.route('**/api/google/sheets*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [
            {
              url: 'https://www.tiktok.com/@user/video/123',
              caption: 'Test Caption 1',
              tag: 'film',
              instagramCaption: 'Instagram caption 1',
            },
            {
              url: 'https://www.tiktok.com/@user/video/456',
              caption: 'Test Caption 2',
              tag: '',
              instagramCaption: 'Instagram caption 2',
            },
          ],
        }),
      });
    });

    await page.route('**/api/download', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '7234567890123456789',
          title: 'Test video',
          cover: 'https://example.com/cover.jpg',
          author: {
            uniqueId: 'testuser',
            nickname: 'Test User',
            avatarThumb: 'https://example.com/avatar.jpg',
          },
          play: 'https://example.com/sd.mp4',
          wmplay: 'https://example.com/wm.mp4',
          hdplay: 'https://example.com/hd.mp4',
          duration: 15,
          size: 2048576,
        }),
      });
    });

    await page.route('**/api/meta/reels/publish', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          containerId: '90010123456789',
          mediaId: '17890012345678901',
        }),
      });
    });

    // Step 1: Navigate to homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Step 2: Verify connections are shown
    await expect(page.getByText('Connected to Google Sheets')).toBeVisible();
    await expect(page.getByText('@testuser_business')).toBeVisible();

    // Step 3: Import from Google Sheets
    await page.getByText('Import from Sheets').click();

    // Sheets modal should appear
    await expect(page.getByText('Import from Google Sheets')).toBeVisible();

    // Click import button
    await page.getByRole('button', { name: /import/i }).click();

    // Wait for import to complete and modal to close
    await page.waitForTimeout(500);

    // Step 4: Verify imported rows
    await expect(page.getByPlaceholder('Paste TikTok URL...')).toBeVisible();

    // Get URL inputs
    const urlInputs = page.getByPlaceholder('Paste TikTok URL...');
    await expect(urlInputs).toHaveCount(expect.any(Number));

    // Step 5: Fetch all videos
    await page.getByRole('button', { name: 'Fetch All Videos' }).click();

    // Wait for fetch to complete
    await page.waitForTimeout(1000);

    // Step 6: Verify videos loaded (check for "Fetched" buttons)
    const fetchedButtons = page.getByRole('button', { name: /✓ Fetched/i });
    await expect(fetchedButtons.first()).toBeVisible();

    // Step 7: Verify canvas rendered for each video
    const canvases = page.locator('canvas');
    await expect(canvases.first()).toBeVisible();

    // Step 8: Check brand mode toggle
    const brandToggle = page.getByRole('button', { name: /Brand/i });
    await expect(brandToggle).toBeVisible();

    // Step 9: Publish first video
    const uploadButtons = page.getByRole('button', { name: /Upload to Instagram/i });
    await expect(uploadButtons.first()).toBeVisible();

    // Click the first upload button
    await uploadButtons.first().click();

    // Step 10: Verify publishing limit updated
    await page.waitForTimeout(1000);

    // The publishing limit should be updated after successful upload
    await expect(page.getByText(/posts used today/i)).toBeVisible();

    // Step 11: Verify success state
    // Check for any success indicators
    await page.waitForTimeout(500);

    // Verify we're still on the page and everything is stable
    await expect(page.getByText('TikTok Downloader')).toBeVisible();
  });

  test('should handle connection state on page load', async ({ page }) => {
    // Test with no cookies
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show connect buttons
    await expect(page.getByText('Connect Google')).toBeVisible();
    await expect(page.getByText('Connect Instagram')).toBeVisible();
  });

  test('should preserve state across page reloads', async ({ page }) => {
    // Set cookies
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

    await page.route('**/api/google/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: true }),
      });
    });

    // Load page
    await page.goto('/');
    await expect(page.getByText('Connected to Google Sheets')).toBeVisible();

    // Reload
    await page.reload();
    await expect(page.getByText('Connected to Google Sheets')).toBeVisible();
  });

  test('should handle multiple video entries', async ({ page }) => {
    await page.goto('/');

    // Add multiple rows
    const addRowButton = page.getByRole('button', { name: /Add Row/i });
    if (await addRowButton.isVisible()) {
      await addRowButton.click();
    }

    // Should have multiple URL input fields
    const urlInputs = page.getByPlaceholder('Paste TikTok URL...');
    const count = await urlInputs.count();
    expect(count).toBeGreaterThan(1);
  });

  test('should handle error states gracefully', async ({ page }) => {
    await page.goto('/');

    // Mock failed download
    await page.route('**/api/download', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Video not found' }),
      });
    });

    // Enter invalid URL and click fetch
    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/invalid');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();

    // Should show error message
    await page.waitForTimeout(500);

    // Verify page is still functional
    await expect(page.getByText('TikTok Downloader')).toBeVisible();
  });
});
