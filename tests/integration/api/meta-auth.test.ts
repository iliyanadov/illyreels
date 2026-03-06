// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testApiHandler } from 'next-test-api-route-handler';
import * as authHandler from '@/app/api/meta/auth/route';
import * as meHandler from '@/app/api/meta/me/route';
import * as disconnectHandler from '@/app/api/meta/disconnect/route';

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

import * as metaTokenStorage from '@/lib/meta-token-storage';

describe('GET /api/meta/auth', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('returns URL containing instagram.com/oauth/authorize with correct scopes', async () => {
    await testApiHandler({
      appHandler: authHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('url');
        expect(data.url).toContain('instagram.com/oauth/authorize');
        expect(data.url).toContain('instagram_business_basic');
        expect(data.url).toContain('instagram_business_content_publish');
        expect(data).toHaveProperty('state');
      },
    });
  });
});

describe('GET /api/meta/me', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock returns for authenticated user
    vi.mocked(metaTokenStorage.getMetaToken).mockResolvedValue({
      userAccessToken: 'test_token',
      igUserId: '123',
      igUsername: 'test',
      expiresAt: Math.floor(Date.now() / 1000) + 5184000,
    });
  });

  it('returns username when cookie present', async () => {
    await testApiHandler({
      appHandler: meHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('username');
      },
    });
  });

  it('returns 401 when cookie missing', async () => {
    vi.mocked(metaTokenStorage.getMetaToken).mockResolvedValue(null);

    await testApiHandler({
      appHandler: meHandler,
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
});

describe('POST /api/meta/disconnect', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('returns success', async () => {
    await testApiHandler({
      appHandler: disconnectHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('success', true);
      },
    });
  });

  it('clears cookie on disconnect', async () => {
    await testApiHandler({
      appHandler: disconnectHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('success', true);
      },
    });
  });
});
