import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './src/mocks/server';

// Setup MSW server
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());

// Mock Next.js headers() and cookies() for App Router
vi.mock('next/headers', () => ({
  headers: () => ({
    get: (name: string) => {
      const headers = new Headers();
      return headers.get(name);
    },
  }),
  cookies: () => {
    const cookieStore = new Map<string, string>();
    return {
      get: (name: string) => {
        const value = cookieStore.get(name);
        return value ? { name, value } : undefined;
      },
      set: (options: { name: string; value: string; [key: string]: any }) => {
        cookieStore.set(options.name, options.value);
      },
      delete: (name: string) => {
        cookieStore.delete(name);
      },
    };
  },
}));

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

// Mock window.matchMedia for responsive tests
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
