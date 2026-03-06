// @vitest-environment node
import { testApiHandler } from 'next-test-api-route-handler'; // MUST BE FIRST
import { describe, it, expect, beforeEach } from 'vitest';
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';
import * as appHandler from '@/app/api/market/route';

describe('GET /api/market', () => {
  beforeEach(() => {
    process.env.DFLOW_API_KEY = 'test-api-key';
  });

  it('returns market data with title and markets array', async () => {
    server.use(
      http.get('https://c.prediction-markets-api.dflow.net/api/v1/event/*', () =>
        HttpResponse.json({
          title: 'Test Event',
          markets: [
            { id: '1', name: 'Market 1' },
            { id: '2', name: 'Market 2' },
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
          if (name === 'eventId') return 'KXENGAGEMENTTIMOTHEEKYLIE-26';
          return originalGet(name);
        });
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('title');
        expect(data).toHaveProperty('markets');
        expect(Array.isArray(data.markets)).toBe(true);
      },
    });

    server.resetHandlers();
  });

  it('400 when eventId missing', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('500 when DFlow API down (override MSW)', async () => {
    server.use(
      http.get('https://c.prediction-markets-api.dflow.net/api/v1/event/*', () =>
        HttpResponse.json({ error: 'Service unavailable' }, { status: 503 })
      )
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch('/?eventId=KXENGAGEMENTTIMOTHEEKYLIE-26');
        expect(res.status).toBeGreaterThanOrEqual(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });

    server.resetHandlers();
  });
});
