// @vitest-environment node
import { testApiHandler } from 'next-test-api-route-handler'; // MUST BE FIRST
import { describe, it, expect } from 'vitest';
import * as appHandler from '@/app/api/proxy/route';

describe('GET /api/proxy', () => {
  it('403 for non-whitelisted host (evil.com)', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        // Pass the URL through a custom header for testing
        req.headers.set('x-test-url', 'https://evil.com/video.mp4');
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(403);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('400 for missing url param', async () => {
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

  it('allows tiktok CDN hosts (not 403)', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        req.headers.set('x-test-url', 'https://tikwm.com/video.mp4');
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        // Should not be 403 (forbidden), may be 502 if upstream fails but that's OK
        expect(res.status).not.toBe(403);
      },
    });
  });

  it('allows instagram CDN hosts (not 403)', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        req.headers.set('x-test-url', 'https://cdninstagram.com/video.mp4');
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        // Should not be 403 (forbidden)
        expect(res.status).not.toBe(403);
      },
    });
  });

  it('403 for lookalike hosts (tiktok.com.evil.com)', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        req.headers.set('x-test-url', 'https://tiktok.com.evil.com/video.mp4');
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(403);

        const data = await res.json();
        expect(data).toHaveProperty('error');
      },
    });
  });

  it('allows subdomains of whitelisted hosts', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        req.headers.set('x-test-url', 'https://sub.tiktokcdn.com/video.mp4');
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        // Should not be 403 (forbidden)
        expect(res.status).not.toBe(403);
      },
    });
  });

  it('403 for another lookalike (com.tiktokcdn.evil.com)', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(req) {
        req.headers.set('x-test-url', 'https://com.tiktokcdn.evil.com/video.mp4');
      },
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(403);
      },
    });
  });
});
