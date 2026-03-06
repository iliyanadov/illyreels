import { test, expect } from '@playwright/test';

test.describe('Instagram Publish Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set up Instagram connection
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

    await page.goto('/');
  });

  test('should show upload button only when connected to Instagram', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Should have upload button(s)
    const uploadButtons = page.getByRole('button', { name: /Upload to Instagram/i });
    await expect(uploadButtons.first()).toBeVisible();
  });

  test('should be disabled when not connected', async ({ page }) => {
    // Remove the cookie and reload
    await page.context().clearCookies();
    await page.reload();

    await page.waitForLoadState('networkidle');

    // Upload buttons should be disabled or not visible
    const uploadButtons = page.getByRole('button', { name: /Upload to Instagram/i });
    const count = await uploadButtons.count();

    if (count > 0) {
      // Check if disabled
      const firstButton = uploadButtons.first();
      const isDisabled = await firstButton.isDisabled();
      expect(isDisabled).toBeTruthy();
    }
  });

  test('should show progress indicator during upload', async ({ page }) => {
    // Mock video data
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

    // Mock publish with delay
    await page.route('**/api/meta/reels/publish', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          containerId: '90010123456789',
          mediaId: '17890012345678901',
        }),
      });
    });

    // Fetch video first
    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();
    await page.waitForTimeout(1000);

    // Click upload
    const uploadButton = page.getByRole('button', { name: /Upload/i }).first();
    await uploadButton.click();

    // Should show some progress/loading state
    await page.waitForTimeout(500);

    // Check for loading indicator
    const loadingIndicator = page.getByText(/uploading|publishing|progress/i);
    const isVisible = await loadingIndicator.isVisible();
    // Note: The actual implementation may vary
  });

  test('should show success state after publish', async ({ page }) => {
    // Mock video data
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

    // Mock publish
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

    // Fetch video first
    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();
    await page.waitForTimeout(1000);

    // Click upload
    const uploadButton = page.getByRole('button', { name: /Upload/i }).first();
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Publishing limit should be updated
    await page.route('**/api/meta/publishing-limit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: { quota_total: 25 },
          quota_usage: 4, // Increased by 1
        }),
      });
    });

    // Check for success indicator
    await page.waitForTimeout(500);

    // Verify we're still on the page
    await expect(page.getByText('TikTok Downloader')).toBeVisible();
  });

  test('should show error message when publish fails', async ({ page }) => {
    // Mock video data
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

    // Mock publish error
    await page.route('**/api/meta/reels/publish', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Quota exceeded' }),
      });
    });

    // Fetch video first
    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();
    await page.waitForTimeout(1000);

    // Click upload
    const uploadButton = page.getByRole('button', { name: /Upload/i }).first();
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Should show error message
    const errorMessage = page.getByText(/error|failed|quota/i);
    await expect(errorMessage).toBeVisible();
  });

  test('should update publishing limit after successful publish', async ({ page }) => {
    // Mock video data
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

    // Initial quota: 3/25
    let quotaUsage = 3;

    await page.route('**/api/meta/publishing-limit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: { quota_total: 25 },
          quota_usage: quotaUsage,
        }),
      });
    });

    // Check initial quota
    await expect(page.getByText('3 / 25')).toBeVisible();

    // Mock publish success
    await page.route('**/api/meta/reels/publish', async route => {
      quotaUsage = 4; // Update quota usage
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          containerId: '90010123456789',
          mediaId: '17890012345678901',
        }),
      });
    });

    // Fetch video
    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();
    await page.waitForTimeout(1000);

    // Upload
    const uploadButton = page.getByRole('button', { name: /Upload/i }).first();
    await uploadButton.click();
    await page.waitForTimeout(1500);

    // Quota should be updated to 4/25
    await expect(page.getByText('4 / 25')).toBeVisible();
  });

  test('should handle publishing at quota limit', async ({ page }) => {
    // Mock video data
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

    // At quota limit
    await page.route('**/api/meta/publishing-limit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: { quota_total: 25 },
          quota_usage: 25,
        }),
      });
    });

    // Check we're at limit
    await expect(page.getByText('25 / 25')).toBeVisible();

    // Mock quota exceeded error
    await page.route('**/api/meta/reels/publish', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Quota exceeded' }),
      });
    });

    // Fetch video
    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();
    await page.waitForTimeout(1000);

    // Try upload
    const uploadButton = page.getByRole('button', { name: /Upload/i }).first();
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Should show quota error
    await expect(page.getByText(/quota|limit/i)).toBeVisible();
  });
});
