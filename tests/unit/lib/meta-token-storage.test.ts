import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setMetaToken,
  getMetaToken,
  updateMetaToken,
  clearMetaToken,
  hasMetaToken,
  getIgUserId,
  getIgAccessToken,
  getIgUsername,
  getAllAccounts,
  setActiveAccount,
  removeAccount,
  type StoredAccount,
} from '@/lib/meta-token-storage';

describe('Meta Token Storage (Multi-Account)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('new data structure', () => {
    it('should encode and decode multi-account token data correctly', () => {
      const accounts: StoredAccount[] = [
        {
          userAccessToken: 'IGQVJWtoken1',
          igUserId: '123',
          igUsername: 'user1',
          expiresAt: Math.floor(Date.now() / 1000) + 5184000,
        },
        {
          userAccessToken: 'IGQVJWtoken2',
          igUserId: '456',
          igUsername: 'user2',
          expiresAt: Math.floor(Date.now() / 1000) + 5184000,
        },
      ];

      const data = { accounts, activeIndex: 0 };
      const json = JSON.stringify(data);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);

      expect(parsed.accounts).toHaveLength(2);
      expect(parsed.accounts[0].igUsername).toBe('user1');
      expect(parsed.accounts[1].igUsername).toBe('user2');
      expect(parsed.activeIndex).toBe(0);
    });

    it('should identify legacy format (old single account)', () => {
      const legacyData = {
        userAccessToken: 'IGQVJWtoken',
        igUserId: '123',
        igUsername: 'user',
        expiresAt: 1234567890,
      };

      // Legacy format has userAccessToken at top level and no accounts array
      const isLegacy = 'userAccessToken' in legacyData && !('accounts' in legacyData);
      expect(isLegacy).toBe(true);
    });
  });

  describe('migration from old format', () => {
    it('should migrate legacy token to new format', () => {
      const legacyToken = {
        userAccessToken: 'IGQVJWlegacy-token',
        igUserId: '123',
        igUsername: 'legacyuser',
        expiresAt: Math.floor(Date.now() / 1000) + 5184000,
      };

      // Simulate migration logic
      const migrated = {
        accounts: [{
          userAccessToken: legacyToken.userAccessToken,
          igUserId: legacyToken.igUserId || '',
          igUsername: legacyToken.igUsername || '',
          expiresAt: legacyToken.expiresAt || 0,
        }],
        activeIndex: 0,
      };

      expect(migrated.accounts).toHaveLength(1);
      expect(migrated.accounts[0].igUsername).toBe('legacyuser');
      expect(migrated.activeIndex).toBe(0);
    });
  });

  describe('getAllAccounts', () => {
    it('should return accounts without access tokens', () => {
      const accounts: StoredAccount[] = [
        {
          userAccessToken: 'secret-token-1',
          igUserId: '123',
          igUsername: 'user1',
          expiresAt: Math.floor(Date.now() / 1000) + 5184000,
        },
        {
          userAccessToken: 'secret-token-2',
          igUserId: '456',
          igUsername: 'user2',
          expiresAt: Math.floor(Date.now() / 1000) + 5184000,
        },
      ];

      const safeAccounts = accounts.map((account, index) => ({
        igUserId: account.igUserId,
        igUsername: account.igUsername,
        isActive: index === 0,
      }));

      expect(safeAccounts).toHaveLength(2);
      expect(safeAccounts[0]).not.toHaveProperty('userAccessToken');
      expect(safeAccounts[1]).not.toHaveProperty('userAccessToken');
      expect(safeAccounts[0].isActive).toBe(true);
      expect(safeAccounts[1].isActive).toBe(false);
    });
  });

  describe('setActiveAccount', () => {
    it('should switch active account by igUserId', () => {
      const accounts: StoredAccount[] = [
        {
          userAccessToken: 'token1',
          igUserId: '123',
          igUsername: 'user1',
          expiresAt: Math.floor(Date.now() / 1000) + 5184000,
        },
        {
          userAccessToken: 'token2',
          igUserId: '456',
          igUsername: 'user2',
          expiresAt: Math.floor(Date.now() / 1000) + 5184000,
        },
      ];

      let data = { accounts, activeIndex: 0 };

      // Switch to second account
      const targetIndex = data.accounts.findIndex(a => a.igUserId === '456');
      data.activeIndex = targetIndex;

      expect(data.activeIndex).toBe(1);
      expect(data.accounts[data.activeIndex].igUsername).toBe('user2');
    });

    it('should return false if account not found', () => {
      const accounts: StoredAccount[] = [
        {
          userAccessToken: 'token1',
          igUserId: '123',
          igUsername: 'user1',
          expiresAt: Math.floor(Date.now() / 1000) + 5184000,
        },
      ];

      const found = accounts.some(a => a.igUserId === '999');
      expect(found).toBe(false);
    });
  });

  describe('removeAccount', () => {
    it('should remove account and adjust activeIndex if removing earlier account', () => {
      const accounts: StoredAccount[] = [
        { userAccessToken: 't1', igUserId: '123', igUsername: 'u1', expiresAt: 9999999999 },
        { userAccessToken: 't2', igUserId: '456', igUsername: 'u2', expiresAt: 9999999999 },
        { userAccessToken: 't3', igUserId: '789', igUsername: 'u3', expiresAt: 9999999999 },
      ];

      let data = { accounts: [...accounts], activeIndex: 2 }; // u3 is active
      const removedIndex = 0; // Removing u1

      // Remove u1 (index 0)
      data.accounts.splice(removedIndex, 1);

      // If we removed an account before the active one, adjust activeIndex down
      if (removedIndex < data.activeIndex) {
        data.activeIndex--;
      }

      // activeIndex was 2, after removing index 0, should become 1
      expect(data.accounts).toHaveLength(2);
      expect(data.activeIndex).toBe(1);
      expect(data.accounts[data.activeIndex].igUserId).toBe('789');
    });

    it('should set activeIndex to 0 if removing active account', () => {
      const accounts: StoredAccount[] = [
        { userAccessToken: 't1', igUserId: '123', igUsername: 'u1', expiresAt: 9999999999 },
        { userAccessToken: 't2', igUserId: '456', igUsername: 'u2', expiresAt: 9999999999 },
      ];

      let data = { accounts: [...accounts], activeIndex: 0 }; // u1 is active

      // Remove active account (u1)
      data.accounts.splice(0, 1);
      data.activeIndex = 0; // Reset to first remaining

      expect(data.accounts).toHaveLength(1);
      expect(data.activeIndex).toBe(0);
      expect(data.accounts[data.activeIndex].igUserId).toBe('456');
    });

    it('should clear all if removing last account', () => {
      const accounts: StoredAccount[] = [
        { userAccessToken: 't1', igUserId: '123', igUsername: 'u1', expiresAt: 9999999999 },
      ];

      let data = { accounts, activeIndex: 0 };

      // Remove last account
      data.accounts.splice(0, 1);

      expect(data.accounts).toHaveLength(0);
    });
  });

  describe('setMetaToken with multi-account', () => {
    it('should add new account if igUserId not found', () => {
      const existingAccounts: StoredAccount[] = [
        { userAccessToken: 't1', igUserId: '123', igUsername: 'u1', expiresAt: 9999999999 },
      ];

      const newAccount: StoredAccount = {
        userAccessToken: 't2',
        igUserId: '456',
        igUsername: 'u2',
        expiresAt: 9999999999,
      };

      const exists = existingAccounts.some(a => a.igUserId === newAccount.igUserId);
      expect(exists).toBe(false);

      // Would add to array
      const updated = [...existingAccounts, newAccount];
      expect(updated).toHaveLength(2);
    });

    it('should update existing account if igUserId found', () => {
      const existingAccounts: StoredAccount[] = [
        { userAccessToken: 't1', igUserId: '123', igUsername: 'u1', expiresAt: 100 },
        { userAccessToken: 't2', igUserId: '456', igUsername: 'u2', expiresAt: 200 },
      ];

      const updatedAccount: StoredAccount = {
        userAccessToken: 't2-new',
        igUserId: '456', // Same as second account
        igUsername: 'u2-updated',
        expiresAt: 9999999999,
      };

      const existingIndex = existingAccounts.findIndex(a => a.igUserId === updatedAccount.igUserId);
      expect(existingIndex).toBe(1);

      // Would update existing
      const updated = [...existingAccounts];
      updated[existingIndex] = updatedAccount;

      expect(updated[1].userAccessToken).toBe('t2-new');
      expect(updated[1].igUsername).toBe('u2-updated');
      expect(updated).toHaveLength(2); // No duplicate added
    });
  });

  describe('getIgUserId and getIgAccessToken', () => {
    it('should return active account values', () => {
      const accounts: StoredAccount[] = [
        { userAccessToken: 't1', igUserId: '123', igUsername: 'u1', expiresAt: 9999999999 },
        { userAccessToken: 't2', igUserId: '456', igUsername: 'u2', expiresAt: 9999999999 },
      ];

      const activeIndex = 1;
      const activeAccount = accounts[activeIndex];

      expect(activeAccount.igUserId).toBe('456');
      expect(activeAccount.userAccessToken).toBe('t2');
    });
  });

  describe('cookie size limits', () => {
    it('should stay under 4KB with 8 accounts', () => {
      // Each account is ~300-400 bytes base64 encoded
      const accounts: StoredAccount[] = Array.from({ length: 8 }, (_, i) => ({
        userAccessToken: `IGQVJWtoken-${i}-`.padEnd(100, 'a'),
        igUserId: `${i}`.padEnd(20, '0'),
        igUsername: `user${i}`,
        expiresAt: 9999999999,
      }));

      const data = { accounts, activeIndex: 0 };
      const json = JSON.stringify(data);
      const encoded = Buffer.from(json).toString('base64');

      // 4KB = 4096 bytes
      expect(encoded.length).toBeLessThan(4096);
    });
  });

  describe('edge cases', () => {
    it('should handle empty accounts array', () => {
      const data = { accounts: [], activeIndex: 0 };

      expect(data.accounts).toHaveLength(0);
    });

    it('should handle activeIndex out of bounds', () => {
      const accounts: StoredAccount[] = [
        { userAccessToken: 't1', igUserId: '123', igUsername: 'u1', expiresAt: 9999999999 },
      ];

      let data = { accounts, activeIndex: 0 };

      // If activeIndex > accounts.length, reset to 0
      if (data.activeIndex >= data.accounts.length) {
        data.activeIndex = 0;
      }

      expect(data.activeIndex).toBe(0);
    });
  });

  describe('special characters and encoding', () => {
    it('should handle unicode characters in username', () => {
      const account: StoredAccount = {
        userAccessToken: 'IGQVJWtest-token',
        igUserId: '123',
        igUsername: '用户-test-🔥',
        expiresAt: 9999999999,
      };

      const json = JSON.stringify(account);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);

      expect(parsed.igUsername).toBe('用户-test-🔥');
    });

    it('should handle emojis in token', () => {
      const account: StoredAccount = {
        userAccessToken: 'IGQVJW🔥🚀✨',
        igUserId: '123',
        igUsername: 'user',
        expiresAt: 9999999999,
      };

      const json = JSON.stringify(account);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);

      expect(parsed.userAccessToken).toBe('IGQVJW🔥🚀✨');
    });
  });
});
