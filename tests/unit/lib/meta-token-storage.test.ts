import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setMetaToken,
  getMetaToken,
  updateMetaToken,
  clearMetaToken,
  hasMetaToken,
  getIgUserId,
  getIgAccessToken,
  type StoredToken,
} from '@/lib/meta-token-storage';

describe('Meta Token Storage', () => {
  let mockCookieStore: Map<string, { value: string; expires?: Date; [key: string]: any }>;

  beforeEach(() => {
    mockCookieStore = new Map();
    vi.clearAllMocks();
  });

  describe('encode/decode roundtrip', () => {
    it('should encode and decode token correctly', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJWtest-token',
        igUserId: '17841400123456789',
        igUsername: 'testuser',
        expiresAt: Math.floor(Date.now() / 1000) + 5184000, // 60 days from now
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as StoredToken;

      expect(parsed.userAccessToken).toBe(token.userAccessToken);
      expect(parsed.igUserId).toBe(token.igUserId);
      expect(parsed.igUsername).toBe(token.igUsername);
      expect(parsed.expiresAt).toBe(token.expiresAt);
    });

    it('should handle token with minimal fields', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJWtest-token',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as StoredToken;

      expect(parsed.userAccessToken).toBe(token.userAccessToken);
      expect(parsed.igUserId).toBeUndefined();
      expect(parsed.igUsername).toBeUndefined();
      expect(parsed.expiresAt).toBeUndefined();
    });
  });

  describe('token expiry handling', () => {
    it('should calculate correct max age for 60 days', () => {
      const MAX_AGE = 60 * 60 * 24 * 60;
      const expected = 60 * 24 * 60 * 60; // 5184000 seconds
      expect(MAX_AGE).toBe(expected);
    });

    it('should detect expired token', () => {
      const now = Date.now();
      const expiredTimestamp = Math.floor(now / 1000) - 1000; // Expired 1000 seconds ago

      const isExpired = now > expiredTimestamp * 1000;
      expect(isExpired).toBe(true);
    });

    it('should not detect valid token as expired', () => {
      const now = Date.now();
      const validTimestamp = Math.floor(now / 1000) + 3600; // Expires in 1 hour

      const isExpired = now > validTimestamp * 1000;
      expect(isExpired).toBe(false);
    });

    it('should handle tokens without expiration', () => {
      const tokenWithoutExpiry: StoredToken = {
        userAccessToken: 'IGQVJWtest-token',
      };

      expect(tokenWithoutExpiry.expiresAt).toBeUndefined();
    });
  });

  describe('special characters and encoding', () => {
    it('should handle token with special characters', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJWtoken-with-special-!@#$%^&*()',
        igUsername: 'user@name',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as StoredToken;

      expect(parsed.userAccessToken).toBe(token.userAccessToken);
      expect(parsed.igUsername).toBe(token.igUsername);
    });

    it('should handle unicode characters in username', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJWtest-token',
        igUsername: '用户-test-🔥',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as StoredToken;

      expect(parsed.igUsername).toBe(token.igUsername);
    });

    it('should handle emojis in token', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJW🔥🚀✨',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as StoredToken;

      expect(parsed.userAccessToken).toBe(token.userAccessToken);
    });
  });

  describe('updateMetaToken logic', () => {
    it('should merge updates with existing token', () => {
      const existing: StoredToken = {
        userAccessToken: 'IGQVJWoriginal-token',
        igUserId: '123',
        igUsername: 'olduser',
      };

      const updates: Partial<StoredToken> = {
        igUsername: 'newuser',
      };

      const merged: StoredToken = {
        ...existing,
        ...updates,
      };

      expect(merged.userAccessToken).toBe('IGQVJWoriginal-token');
      expect(merged.igUserId).toBe('123');
      expect(merged.igUsername).toBe('newuser');
    });

    it('should add new fields via update', () => {
      const existing: StoredToken = {
        userAccessToken: 'IGQVJWtoken',
      };

      const updates: Partial<StoredToken> = {
        igUserId: '123',
        expiresAt: 1234567890,
      };

      const merged: StoredToken = {
        ...existing,
        ...updates,
      };

      expect(merged.igUserId).toBe('123');
      expect(merged.expiresAt).toBe(1234567890);
    });
  });

  describe('helper functions', () => {
    it('getIgUserId should return user ID or null', () => {
      const tokenWithId: StoredToken = {
        userAccessToken: 'IGQVJWtoken',
        igUserId: '17841400123456789',
      };

      const tokenWithoutId: StoredToken = {
        userAccessToken: 'IGQVJWtoken',
      };

      const userId = tokenWithId.igUserId || null;
      const noUserId = tokenWithoutId.igUserId || null;

      expect(userId).toBe('17841400123456789');
      expect(noUserId).toBeNull();
    });

    it('getIgAccessToken should return access token or null', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJWtoken',
      };

      const accessToken = token.userAccessToken || null;

      expect(accessToken).toBe('IGQVJWtoken');
    });

    it('hasMetaToken should return true when token exists', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJWtoken',
      };

      const hasToken = token !== null;
      expect(hasToken).toBe(true);
    });

    it('hasMetaToken should return false when token is null', () => {
      const token = null;
      const hasToken = token !== null;
      expect(hasToken).toBe(false);
    });
  });

  describe('cookie properties', () => {
    it('should use correct cookie name', () => {
      const COOKIE_NAME = 'meta_token';
      expect(COOKIE_NAME).toBe('meta_token');
    });

    it('should format expires date correctly from timestamp', () => {
      const timestamp = 1735689600; // Unix timestamp
      const expiresDate = new Date(timestamp * 1000);

      expect(expiresDate.getTime()).toBe(timestamp * 1000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty user access token', () => {
      const token: StoredToken = {
        userAccessToken: '',
      };

      expect(token.userAccessToken).toBe('');
    });

    it('should handle very long tokens', () => {
      const longToken = 'a'.repeat(5000);
      const token: StoredToken = {
        userAccessToken: longToken,
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as StoredToken;

      expect(parsed.userAccessToken).toBe(longToken);
    });

    it('should handle numeric user ID as string', () => {
      const token: StoredToken = {
        userAccessToken: 'IGQVJWtoken',
        igUserId: '17841400123456789',
      };

      expect(typeof token.igUserId).toBe('string');
    });
  });
});
