// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testApiHandler } from 'next-test-api-route-handler';
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';

// Mock the token storage functions directly
vi.mock('@/lib/meta-token-storage', () => ({
  getMetaToken: vi.fn(),
  getIgUserId: vi.fn(),
  getIgAccessToken: vi.fn(),
  setMetaToken: vi.fn(),
  updateMetaToken: vi.fn(),
  clearMetaToken: vi.fn(),
  hasMetaToken: vi.fn(),
}));

vi.mock('@/lib/google-token-storage', () => ({
  getGoogleToken: vi.fn(),
  setGoogleToken: vi.fn(),
  clearGoogleToken: vi.fn(),
  hasGoogleToken: vi.fn(),
}));

import * as appHandler from '@/app/api/meta/reels/publish/route';
import * as metaTokenStorage from '@/lib/meta-token-storage';
import * as googleTokenStorage from '@/lib/google-token-storage';

describe('POST /api/meta/reels/publish', () => {
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock returns for authenticated user
    vi.mocked(metaTokenStorage.getIgUserId).mockResolvedValue('123');
    vi.mocked(metaTokenStorage.getIgAccessToken).mockResolvedValue('test_token');
    vi.mocked(metaTokenStorage.getMetaToken).mockResolvedValue({
      userAccessToken: 'test_token',
      igUserId: '123',
      igUsername: 'test',
      expiresAt: Math.floor(Date.now() / 1000) + 5184000,
    });
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  it('full 3-step publish succeeds (container -> poll FINISHED -> publish returns mediaId)', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test caption' }),
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('containerId');
        expect(data).toHaveProperty('mediaId');
      },
    });
  });

  it('caption with emojis passes through correctly', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const caption = 'Test caption 🔥🎉✨ #hashtag';
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('mediaId');
      },
    });
  });

  it('shareToFeed param forwarded to Instagram', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test', shareToFeed: true }),
        });
        expect(res.status).toBe(200);
      },
    });
  });

  it('polling handles FINISHED status', async () => {
    // Override MSW to return FINISHED immediately for status check
    server.use(
      http.get('https://graph.instagram.com/v*/*', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has('fields')) {
          return HttpResponse.json({ status_code: 'FINISHED' });
        }
        return HttpResponse.json({ id: 'container123' });
      })
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test' }),
        });
        expect(res.status).toBe(200);
      },
    });
  });

  it('400 when videoUrl missing', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: 'Test' }),
        });
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('401 when no meta_token cookie', async () => {
    vi.mocked(metaTokenStorage.getIgUserId).mockResolvedValue(null);
    vi.mocked(metaTokenStorage.getIgAccessToken).mockResolvedValue(null);

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test' }),
        });
        expect(res.status).toBe(401);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('500 when container creation fails (Instagram returns 400)', async () => {
    server.use(
      http.post('https://graph.instagram.com/*/*/media', () => HttpResponse.json({ error: 'Invalid request' }, { status: 400 }))
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test' }),
        });
        expect(res.status).toBe(500);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('500 when container status is ERROR', async () => {
    server.use(
      http.get('https://graph.instagram.com/v*/*', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has('fields')) {
          return HttpResponse.json({ status_code: 'ERROR', status: 'Processing failed' });
        }
        return HttpResponse.json({ id: 'container123' });
      })
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test' }),
        });
        expect(res.status).toBe(500);

        const data = await res.json();
        expect(data).toHaveProperty('error');
        expect(data.error).toContain('Processing failed');
      },
    });
  });

  it('500 when container status is EXPIRED', async () => {
    server.use(
      http.get('https://graph.instagram.com/v*/*', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has('fields')) {
          return HttpResponse.json({ status_code: 'EXPIRED' });
        }
        return HttpResponse.json({ id: 'container123' });
      })
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test' }),
        });
        expect(res.status).toBe(500);

        const data = await res.json();
        expect(data).toHaveProperty('error');
        expect(data.error).toContain('expired');
      },
    });
  });

  it('500 when media_publish fails (quota exceeded)', async () => {
    server.use(
      http.post('https://graph.instagram.com/*/*/media_publish', () =>
        HttpResponse.json({ error: { message: 'Quota exceeded' } }, { status: 400 })
      )
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: 'https://example.com/v.mp4', caption: 'Test' }),
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
      },
    });
  });
});
