// @vitest-environment node
import { testApiHandler } from 'next-test-api-route-handler'; // MUST BE FIRST
import { describe, it, expect } from 'vitest';
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';
import * as appHandler from '@/app/api/download/route';

describe('POST /api/download', () => {
  it('valid TikTok URL returns VideoData with all fields', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.tiktok.com/@user/video/123' }),
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('title');
        expect(data).toHaveProperty('cover');
        expect(data).toHaveProperty('author');
        expect(data).toHaveProperty('play');
        expect(data).toHaveProperty('hdplay');
        expect(data).toHaveProperty('duration');
        expect(data).toHaveProperty('size');
      },
    });
  });

  it('400 for empty URL', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: '   ' }),
        });
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('400 for missing url field', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('502 when tikwm.com returns 500 (override MSW)', async () => {
    server.use(
      http.post('https://www.tikwm.com/api/', () => HttpResponse.json({ error: 'Server error' }, { status: 500 }))
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.tiktok.com/@user/video/123' }),
        });
        expect(res.status).toBe(502);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });

    server.resetHandlers();
  });

  it('400 when tikwm reports video not found (code: -1)', async () => {
    server.use(
      http.post('https://www.tikwm.com/api/', () => HttpResponse.json({ code: -1, msg: 'Video not found' }))
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.tiktok.com/@user/video/invalid' }),
        });
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
        // Error message should be user-friendly
        expect(data.error).not.toContain('code:-1');
      },
    });

    server.resetHandlers();
  });

  it('error messages are user-friendly, not raw API dumps', async () => {
    server.use(
      http.post('https://www.tikwm.com/api/', () =>
        HttpResponse.json({ code: -1, msg: 'Api rate limit exceeded' })
      )
    );

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.tiktok.com/@user/video/123' }),
        });
        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data).toHaveProperty('error');
        // Should mention rate limiting in a user-friendly way
        expect(data.error.toLowerCase()).toMatch(/rate limit|too many|wait/);
      },
    });

    server.resetHandlers();
  });
});
