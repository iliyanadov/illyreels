// @vitest-environment node
import { testApiHandler } from 'next-test-api-route-handler'; // MUST BE FIRST
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as appHandler from '@/app/api/meta/switch/route';

// Mock the token storage functions
vi.mock('@/lib/meta-token-storage', () => ({
  setActiveAccount: vi.fn(),
  getIgUsername: vi.fn(),
}));

import * as metaTokenStorage from '@/lib/meta-token-storage';

describe('POST /api/meta/switch', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('switches to valid account', async () => {
    vi.mocked(metaTokenStorage.setActiveAccount).mockResolvedValue(true);
    vi.mocked(metaTokenStorage.getIgUsername).mockResolvedValue('account_two');

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ igUserId: '456' }),
        });
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toEqual({
          success: true,
          igUserId: '456',
          igUsername: 'account_two',
        });

        expect(metaTokenStorage.setActiveAccount).toHaveBeenCalledWith('456');
      },
    });
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(metaTokenStorage.setActiveAccount).mockResolvedValue(false);

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ igUserId: '999' }),
        });
        expect(res.status).toBe(404);

        const data = await res.json();
        expect(data).toHaveProperty('error', 'Account not found');
      },
    });
  });

  it('returns 400 when igUserId missing', async () => {
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
        expect(data).toHaveProperty('error', 'igUserId is required');
      },
    });
  });

  it('returns 400 when invalid JSON', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json',
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
      },
    });
  });
});
