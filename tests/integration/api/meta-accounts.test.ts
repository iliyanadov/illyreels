// @vitest-environment node
import { testApiHandler } from 'next-test-api-route-handler'; // MUST BE FIRST
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as appHandler from '@/app/api/meta/accounts/route';

// Mock the token storage functions
vi.mock('@/lib/meta-token-storage', () => ({
  getAllAccounts: vi.fn(),
}));

import * as metaTokenStorage from '@/lib/meta-token-storage';

describe('GET /api/meta/accounts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('returns list of accounts when connected', async () => {
    vi.mocked(metaTokenStorage.getAllAccounts).mockResolvedValue([
      { igUserId: '123', igUsername: 'account_one', isActive: true },
      { igUserId: '456', igUsername: 'account_two', isActive: false },
    ]);

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('accounts');
        expect(data.accounts).toHaveLength(2);
        expect(data.accounts[0]).toEqual({
          igUserId: '123',
          igUsername: 'account_one',
          isActive: true,
        });
        expect(data.accounts[1]).toEqual({
          igUserId: '456',
          igUsername: 'account_two',
          isActive: false,
        });
      },
    });
  });

  it('returns empty array when no accounts', async () => {
    vi.mocked(metaTokenStorage.getAllAccounts).mockResolvedValue([]);

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch('/');
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.accounts).toEqual([]);
      },
    });
  });

  it('never includes access tokens in response', async () => {
    vi.mocked(metaTokenStorage.getAllAccounts).mockResolvedValue([
      { igUserId: '123', igUsername: 'account_one', isActive: true },
    ]);

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch('/');
        const data = await res.json();

        expect(JSON.stringify(data)).not.toContain('userAccessToken');
        expect(JSON.stringify(data)).not.toContain('IGQVJ');
      },
    });
  });
});
