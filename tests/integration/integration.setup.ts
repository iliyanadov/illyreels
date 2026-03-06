// Integration test setup for mocking token storage
import { beforeEach, vi } from 'vitest';

// Global test cookie storage
export const testCookies = new Map<string, string>();

export function mockCookieValue(cookieHeader: string) {
  const cookies = new Map<string, string>();
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies.set(name, rest.join('='));
    }
  });
  return cookies;
}

export function setupIntegrationMocks() {
  beforeEach(() => {
    // Clear test cookies before each test
    testCookies.clear();
  });
}

// Helper to set cookies for a test
export function setTestCookie(name: string, value: string) {
  testCookies.set(name, value);
}

// Helper to clear all test cookies
export function clearTestCookies() {
  testCookies.clear();
}
