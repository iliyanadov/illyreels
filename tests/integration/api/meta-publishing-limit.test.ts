// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import * as appHandler from '@/app/api/meta/publishing-limit/route';
import * as metaTokenStorage from '@/lib/meta-token-storage';

describe('GET /api/meta/publishing-limit', () => {
  beforeEach(async () => {
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

  it('extracts quota_total and quota_usage from nested response', async () => {
    server.use(
      http.get('https://graph.instagram.com/*/*/content_publishing_limit', () =>
        HttpResponse.json({
          data: [
            {
              config: {
                quota_total: 25,
                quota_duration: 86400,
              },
              quota_usage: 7,
            },
          ],
        })
      )
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('config', 25);
        expect(data).toHaveProperty('quota_usage', 7);
      },
    });

    server.resetHandlers();
  });

  it('values are numbers not NaN (this was a real bug)', async () => {
    server.use(
      http.get('https://graph.instagram.com/*/*/content_publishing_limit', () =>
        HttpResponse.json({
          data: [
            {
              config: {
                quota_total: 25,
              },
              quota_usage: 7,
            },
          ],
        })
      )
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(typeof data.config).toBe('number');
        expect(typeof data.quota_usage).toBe('number');
        expect(data.config).not.toBeNaN();
        expect(data.quota_usage).not.toBeNaN();
      },
    });

    server.resetHandlers();
  });

  it('handles empty data array without crashing', async () => {
    server.use(
      http.get('https://graph.instagram.com/*/*/content_publishing_limit', () =>
        HttpResponse.json({
          data: [],
        })
      )
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        // Should return default values
        expect(data).toHaveProperty('config');
        expect(data).toHaveProperty('quota_usage');
      },
    });

    server.resetHandlers();
  });

  it('401 when no cookie', async () => {
    vi.mocked(metaTokenStorage.getIgUserId).mockResolvedValue(null);
    vi.mocked(metaTokenStorage.getIgAccessToken).mockResolvedValue(null);

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(401);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('handles Instagram API error (401)', async () => {
    server.use(
      http.get('https://graph.instagram.com/*/*/content_publishing_limit', () => HttpResponse.json({ error: 'Invalid token' }, { status: 401 }))
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBeGreaterThanOrEqual(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });

    server.resetHandlers();
  });
});
