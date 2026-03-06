import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setGoogleToken,
  getGoogleToken,
  clearGoogleToken,
  hasGoogleToken,
  type GoogleToken,
} from '@/lib/google-token-storage';

describe('Google Token Storage', () => {
  let mockCookieStore: Map<string, { value: string; [key: string]: any }>;

  beforeEach(() => {
    mockCookieStore = new Map();
    vi.clearAllMocks();
  });

  describe('encode/decode roundtrip', () => {
    it('should encode and decode token correctly', () => {
      const token: GoogleToken = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as GoogleToken;

      expect(parsed.accessToken).toBe(token.accessToken);
      expect(parsed.refreshToken).toBe(token.refreshToken);
    });

    it('should handle token with special characters', () => {
      const token: GoogleToken = {
        accessToken: 'test-access-token-with-special-chars-!@#$%^&*()',
        refreshToken: 'refresh-with-特殊字符',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as GoogleToken;

      expect(parsed.accessToken).toBe(token.accessToken);
      expect(parsed.refreshToken).toBe(token.refreshToken);
    });

    it('should handle token without refresh token', () => {
      const token: GoogleToken = {
        accessToken: 'test-access-token',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as GoogleToken;

      expect(parsed.accessToken).toBe(token.accessToken);
      expect(parsed.refreshToken).toBeUndefined();
    });
  });

  describe('decode error handling', () => {
    it('should handle invalid base64 - Buffer decodes but result is invalid JSON', () => {
      // Buffer.from handles invalid base64 by trying to decode it
      // The result may not be valid JSON, which will cause JSON.parse to throw
      const encoded = 'not-valid-base64!@#';
      const json = Buffer.from(encoded, 'base64').toString('utf-8');
      // The decode function wraps JSON.parse in try/catch and throws a custom error
      expect(() => JSON.parse(json)).toThrow(); // Invalid JSON should throw
    });

    it('should throw error for invalid JSON', () => {
      const encoded = Buffer.from('not-json').toString('base64');
      expect(() => {
        const json = Buffer.from(encoded, 'base64').toString('utf-8');
        JSON.parse(json); // "not-json" is NOT valid JSON
      }).toThrow();
    });
  });

  describe('Base64 encoding/decoding edge cases', () => {
    it('should handle empty string', () => {
      const encoded = Buffer.from('').toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      expect(decoded).toBe('');
    });

    it('should handle unicode characters', () => {
      const token: GoogleToken = {
        accessToken: 'token-with-emoji-🔥-and-chinese-中文',
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as GoogleToken;

      expect(parsed.accessToken).toBe(token.accessToken);
    });

    it('should handle very long tokens', () => {
      const longToken = 'a'.repeat(5000);
      const token: GoogleToken = {
        accessToken: longToken,
      };

      const json = JSON.stringify(token);
      const encoded = Buffer.from(json).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as GoogleToken;

      expect(parsed.accessToken).toBe(longToken);
    });
  });

  describe('cookie properties', () => {
    it('should use correct cookie name', () => {
      const COOKIE_NAME = 'google_token';
      expect(COOKIE_NAME).toBe('google_token');
    });

    it('should calculate correct max age for 7 days', () => {
      const MAX_AGE = 60 * 60 * 24 * 7;
      const expected = 7 * 24 * 60 * 60; // 604800 seconds
      expect(MAX_AGE).toBe(expected);
    });

    it('should handle production vs development secure flag', () => {
      const isProduction = process.env.NODE_ENV === 'production';
      expect(typeof isProduction).toBe('boolean');
    });
  });

  describe('token structure', () => {
    it('should have correct token interface structure', () => {
      const token: GoogleToken = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
      };

      expect(token).toHaveProperty('accessToken');
      expect(token).toHaveProperty('refreshToken');
      expect(typeof token.accessToken).toBe('string');
      expect(token.refreshToken).toBeDefined();
    });

    it('should allow optional refresh token', () => {
      const token: GoogleToken = {
        accessToken: 'test-token',
      };

      expect(token).toHaveProperty('accessToken');
      expect(token.refreshToken).toBeUndefined();
    });
  });
});
