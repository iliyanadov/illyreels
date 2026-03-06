import '@testing-library/jest-dom/vitest';
import { beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { server } from './src/mocks/server';

// Setup MSW server
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

afterEach(() => {
  // Only call cleanup in jsdom environment (unit tests with React components)
  if (typeof window !== 'undefined') {
    const { cleanup } = require('@testing-library/react');
    cleanup();
  }
  server.resetHandlers();
});

afterAll(() => server.close());

// Store for test cookies that can be set by tests
const testCookieStore = new Map<string, string>();

// Helper to set a test cookie
export function setTestCookie(name: string, value: string) {
  testCookieStore.set(name, value);
}

// Helper to clear test cookies
export function clearTestCookies() {
  testCookieStore.clear();
}

// Helper function to parse cookies from Cookie header string
function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies.set(name, rest.join('='));
    }
  });
  return cookies;
}

// Get cookies from NTARH request context
function getNTARHCookies(): Map<string, string> {
  // NTARH stores the current NextRequest in a predictable location
  const request = (globalThis as any).__next_test_request__;
  if (request?.headers) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      return parseCookieHeader(cookieHeader);
    }
  }
  return new Map();
}

// Mock Next.js headers() and cookies() for App Router
vi.mock('next/headers', () => ({
  headers: () => {
    const request = (globalThis as any).__next_test_request__;
    const headers = new Headers();

    if (request?.headers) {
      request.headers.forEach((value: string, key: string) => {
        headers.set(key, value);
      });
    }

    return {
      get: (name: string) => headers.get(name),
      forEach: (callback: (value: string, key: string) => void) => {
        headers.forEach((value, key) => callback(value, key));
      },
    };
  },
  cookies: () => {
    // First try NTARH request cookies, then fall back to test store
    const ntarhCookies = getNTARHCookies();
    const allCookies = new Map([...ntarhCookies, ...testCookieStore]);

    return {
      get: (name: string) => {
        const value = allCookies.get(name);
        return value ? { name, value } : undefined;
      },
      set: (options: { name: string; value: string; [key: string]: any }) => {
        testCookieStore.set(options.name, options.value);
      },
      delete: (name: string) => {
        testCookieStore.delete(name);
      },
    };
  },
}));

// Clear test cookies before each test
beforeEach(() => {
  clearTestCookies();
});

// Mock @vercel/blob/client
vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn(),
}));

// Mock mp4box
vi.mock('mp4box', () => ({
  default: {
    createFile: () => ({
      addBuffer: vi.fn(),
      flush: vi.fn(),
      initializeSegmentation: vi.fn(),
      mux: vi.fn(),
    }),
  },
}));

// Mock window.matchMedia for responsive tests (jsdom only)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
