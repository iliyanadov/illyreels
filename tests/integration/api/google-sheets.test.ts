// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testApiHandler } from 'next-test-api-route-handler';
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';

// Mock the token storage functions directly
vi.mock('@/lib/google-token-storage', () => ({
  getGoogleToken: vi.fn(),
  setGoogleToken: vi.fn(),
  clearGoogleToken: vi.fn(),
  hasGoogleToken: vi.fn(),
}));

import * as appHandler from '@/app/api/google/sheets/route';
import * as googleTokenStorage from '@/lib/google-token-storage';

// Helper to build auth cookies
function googleCookie() {
  const t = { accessToken: 'ya29.test', refreshToken: '1//test' };
  return 'google_token=' + Buffer.from(JSON.stringify(t)).toString('base64');
}

describe('GET /api/google/sheets', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock returns for authenticated user
    vi.mocked(googleTokenStorage.getGoogleToken).mockResolvedValue({
      accessToken: 'ya29.test',
      refreshToken: '1//test',
    });
  });

  it('returns rows mapped: A->url, B->caption, C->tag, D->instagramCaption', async () => {
    server.use(
      http.get('https://sheets.googleapis.com/v4/spreadsheets/*', () =>
        HttpResponse.json({
          values: [
            ['https://tiktok.com/v1', 'Caption 1', 'tag1', 'IG Caption 1'],
            ['https://tiktok.com/v2', 'Caption 2', 'tag2', 'IG Caption 2'],
          ],
        })
      )
    );

    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        // Mock searchParams.get to return our test value
        const originalGet = req.nextUrl.searchParams.get.bind(req.nextUrl.searchParams);
        req.nextUrl.searchParams.get = vi.fn((name: string) => {
          if (name === 'spreadsheet_id') return 'test-sheet-id';
          return originalGet(name);
        });
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('rows');
        expect(data.rows).toHaveLength(2);
        expect(data.rows[0]).toEqual({
          url: 'https://tiktok.com/v1',
          caption: 'Caption 1',
          tag: 'tag1',
          instagramCaption: 'IG Caption 1',
        });
      },
    });

    server.resetHandlers();
  });

  it('filters out rows without URLs', async () => {
    server.use(
      http.get('https://sheets.googleapis.com/v4/spreadsheets/*', () =>
        HttpResponse.json({
          values: [
            ['https://tiktok.com/v1', 'Caption 1', 'tag1', 'IG Caption 1'],
            ['', 'Caption 2', 'tag2', 'IG Caption 2'],
            ['https://tiktok.com/v3', 'Caption 3', 'tag3', 'IG Caption 3'],
          ],
        })
      )
    );

    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        // Mock searchParams.get to return our test value
        const originalGet = req.nextUrl.searchParams.get.bind(req.nextUrl.searchParams);
        req.nextUrl.searchParams.get = vi.fn((name: string) => {
          if (name === 'spreadsheet_id') return 'test-sheet-id';
          return originalGet(name);
        });
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.rows).toHaveLength(2);
        expect(data.rows[0].url).toBe('https://tiktok.com/v1');
        expect(data.rows[1].url).toBe('https://tiktok.com/v3');
      },
    });

    server.resetHandlers();
  });

  it('handles partial rows (URL but no caption)', async () => {
    server.use(
      http.get('https://sheets.googleapis.com/v4/spreadsheets/*', () =>
        HttpResponse.json({
          values: [
            ['https://tiktok.com/v1', '', 'tag1', ''],
            ['https://tiktok.com/v2', 'Caption 2', '', 'IG Caption 2'],
          ],
        })
      )
    );

    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        // Mock searchParams.get to return our test value
        const originalGet = req.nextUrl.searchParams.get.bind(req.nextUrl.searchParams);
        req.nextUrl.searchParams.get = vi.fn((name: string) => {
          if (name === 'spreadsheet_id') return 'test-sheet-id';
          return originalGet(name);
        });
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.rows).toHaveLength(2);
        expect(data.rows[0]).toEqual({
          url: 'https://tiktok.com/v1',
          caption: '',
          tag: 'tag1',
          instagramCaption: '',
        });
      },
    });

    server.resetHandlers();
  });

  it('400 when spreadsheet_id missing', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('401 when no google_token cookie', async () => {
    vi.mocked(googleTokenStorage.getGoogleToken).mockResolvedValue(null);

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

  it('500 when Sheets API returns error (404)', async () => {
    server.use(
      http.get('https://sheets.googleapis.com/v4/spreadsheets/*', () => HttpResponse.json({ error: 'Not found' }, { status: 404 }))
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
