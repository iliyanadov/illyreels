import { test, expect } from '@playwright/test';

test.describe('Video Download Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should paste TikTok URL and fetch video', async ({ page }) => {
    // Mock the download API
    await page.route('**/api/download', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '7234567890123456789',
          title: 'Test video description',
          cover: 'https://p16-sign.tiktokcdn.com/cover.jpg',
          author: {
            uniqueId: 'testuser',
            nickname: 'Test User',
            avatarThumb: 'https://p16-sign.tiktokcdn.com/avatar.jpg',
          },
          play: 'https://example.com/sd.mp4',
          wmplay: 'https://example.com/wm.mp4',
          hdplay: 'https://example.com/hd.mp4',
          duration: 15,
          size: 2048576,
        }),
      });
    });

    // Paste URL
    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123456789');

    // Click fetch button
    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();

    // Wait for fetch to complete
    await page.waitForTimeout(500);

    // Verify the button changed to "Fetched" or shows checkmark
    await expect(page.getByRole('button', { name: /✓ Fetched/i }).first()).toBeVisible();
  });

  test('should show loading spinner during fetch', async ({ page }) => {
    // Mock with delay
    await page.route('**/api/download', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
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

    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();

    // Check for loading state (button text changes to ...)
    await expect(page.getByRole('button', { name: /^\.\.\.$/i })).toBeVisible();
  });

  test('should show error for invalid URL', async ({ page }) => {
    // Mock error response
    await page.route('**/api/download', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid TikTok URL' }),
      });
    });

    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.youtube.com/watch?v=test');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();

    await page.waitForTimeout(500);

    // Should show error message
    await expect(page.getByText(/Invalid URL|Unsupported URL/i)).toBeVisible();
  });

  test('should handle Fetch All for multiple rows', async ({ page }) => {
    // Add a second row
    const addRowButton = page.getByRole('button', { name: /Add Row/i });
    if (await addRowButton.isVisible()) {
      await addRowButton.click();
    }

    // Mock download API
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

    // Fill URLs
    const urlInputs = page.getByPlaceholder('Paste TikTok URL...');
    const count = await urlInputs.count();

    for (let i = 0; i < count; i++) {
      await urlInputs.nth(i).fill(`https://www.tiktok.com/@user/video/${i}`);
    }

    // Click Fetch All
    const fetchAllButton = page.getByRole('button', { name: /Fetch All Videos/i });
    await fetchAllButton.click();

    // Wait for all to complete
    await page.waitForTimeout(1000);

    // Verify all are fetched
    const fetchedButtons = page.getByRole('button', { name: /✓ Fetched/i });
    await expect(fetchedButtons).toHaveCount(count);
  });

  test('should handle video not found error', async ({ page }) => {
    await page.route('**/api/download', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Video not found. The link may be private, deleted, or invalid.',
        }),
      });
    });

    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/not-found');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();

    await page.waitForTimeout(500);

    // Should show specific error message
    await expect(page.getByText(/Video not found|private|deleted/i)).toBeVisible();
  });

  test('should retry failed video fetch', async ({ page }) => {
    let attemptCount = 0;

    await page.route('**/api/download', async route => {
      attemptCount++;
      if (attemptCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Upstream service error' }),
        });
      } else {
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
      }
    });

    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.tiktok.com/@user/video/123');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();

    await page.waitForTimeout(500);

    // Should show Retry button
    const retryButton = page.getByRole('button', { name: /Retry/i }).first();
    await expect(retryButton).toBeVisible();

    // Click retry
    await retryButton.click();

    await page.waitForTimeout(500);

    // Should succeed on retry
    await expect(page.getByRole('button', { name: /✓ Fetched/i }).first()).toBeVisible();
  });

  test('should handle Instagram URLs', async ({ page }) => {
    await page.route('**/api/download', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '7234567890000000000',
          title: '',
          cover: 'https://instagram.faal2-1.fna.fbcdn.net/cover.jpg',
          author: {
            uniqueId: 'instagram',
            nickname: 'Instagram User',
            avatarThumb: '',
          },
          play: 'https://instagram.faal2-1.fna.fbcdn.net/video.mp4',
          wmplay: 'https://instagram.faal2-1.fna.fbcdn.net/video.mp4',
          hdplay: 'https://instagram.faal2-1.fna.fbcdn.net/video.mp4',
          duration: 0,
          size: 0,
        }),
      });
    });

    const urlInput = page.getByPlaceholder('Paste TikTok URL...');
    await urlInput.fill('https://www.instagram.com/reel/ABC123/');

    const fetchButton = page.getByRole('button', { name: /Fetch/i }).first();
    await fetchButton.click();

    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: /✓ Fetched/i }).first()).toBeVisible();
  });
});
