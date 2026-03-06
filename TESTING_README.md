# IllyReels - Testing Documentation

## Test Results Summary

### ✅ All Tests Passing (128/128)
- **Unit Tests**: 86 tests
- **Integration Tests**: 42 tests
- **Coverage**: ~80% target configured
- **Duration**: ~4 seconds

```
Test Files: 12 passed
Tests: 128 passed
Duration: ~3-4 seconds
```

---

## Test Architecture

```
tests/
├── unit/              # Isolated unit tests (86 tests)
│   ├── lib/          # Token storage, utilities
│   └── utils/        # Helper functions
└── integration/       # API route integration tests (42 tests)
    └── api/          # All 7 API endpoints tested
```

### Unit Tests (86 tests)

| File | Tests | Coverage |
|------|-------|----------|
| `google-token-storage.test.ts` | 13 | Token encoding/decoding, cookie handling |
| `meta-token-storage.test.ts` | 20 | Instagram token management, expiry |
| `video-url-selection.test.ts` | 11 | Video URL priority logic |
| `caption-fallback.test.ts` | 28 | Caption selection with emojis |
| `entry-id.test.ts` | 14 | Unique ID generation |

### Integration Tests (42 tests)

| Endpoint | Tests | Coverage |
|----------|-------|----------|
| `GET /api/google/sheets` | 6 | Spreadsheet fetch, filtering, auth |
| `GET /api/meta/auth` | 5 | Instagram OAuth URL generation |
| `GET /api/meta/me` | 5 | User info retrieval |
| `POST /api/meta/reels-publish` | 10 | Container creation, polling, publish |
| `GET /api/meta/publishing-limit` | 5 | Quota checking |
| `GET /api/download` | 6 | Video proxy, domain whitelist |
| `GET /api/proxy` | 7 | Generic proxy, streaming |
| `GET /api/market` | 3 | DFlow market data |

---

## Testing Stack

- **Runner**: Vitest
- **Mocks**: MSW (Mock Service Worker) for external APIs
- **Integration Framework**: `next-test-api-route-handler` (NTARH)
- **Coverage**: v8 with 80% thresholds

### External Services Mocked

- Google Sheets API (`sheets.googleapis.com`)
- Instagram Graph API (`graph.instagram.com`)
- DFlow prediction markets API
- Vercel Blob API
- `mp4box` video processing

---

## NPM Commands

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## Error Tracking (Sentry)

Production error tracking is configured via Sentry:

```typescript
// Server-side error tracking
import * as Sentry from "@sentry/nextjs";

// Automatic error capture from:
// - API routes
// - Server actions
// - Middleware
```

### Environment Variables

```bash
# Required for Sentry
NEXT_PUBLIC_SENTRY_DSN=your_dsn
SENTRY_DSN=your_dsn
SENTRY_AUTH_TOKEN=your_token
SENTRY_ORG=your_org
SENTRY_PROJECT=your_project
```

### Features

- **Error tracking**: Automatic capture of unhandled errors
- **Performance monitoring**: 10% transaction sampling
- **Session replay**: Capture sessions with errors (100%)
- **Source maps**: Automatic upload on build

**Note**: Events are filtered in development mode (not sent to Sentry).

---

## Coverage Targets

Thresholds configured in `vitest.config.ts`:

| Metric | Target |
|--------|--------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

---

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/test.yml`) includes:
- Unit/integration tests with coverage
- TypeScript type checking
- ESLint

---

## E2E Testing (Future Work)

End-to-end test files exist in `tests/e2e/` but are not currently integrated into the test suite. These can be enabled when:

1. Cross-browser testing requirements are defined
2. OAuth flow mocking is implemented
3. Test data seeding strategy is established

To run E2E tests manually:
```bash
npx playwright install chromium
npx playwright test tests/e2e/basic.spec.ts --project=chromium
```

---

## What's NOT Tested

1. **Frontend UI components** - Component tests would add value for catching visual bugs
2. **OAuth callback flows** - Integration with actual OAuth providers
3. **Real API calls** - All external dependencies are mocked

---

## Development Notes

### Query Parameter Testing with NTARH

When testing API routes that use `request.nextUrl.searchParams`, use `requestPatcher`:

```typescript
await testApiHandler({
  appHandler,
  requestPatcher(req) {
    const originalGet = req.nextUrl.searchParams.get.bind(req.nextUrl.searchParams);
    req.nextUrl.searchParams.get = vi.fn((name: string) => {
      if (name === 'spreadsheet_id') return 'test-sheet-id';
      return originalGet(name);
    });
  },
  test: async ({ fetch }) => {
    const res = await fetch('/');
    expect(res.status).toBe(200);
  },
});
```

---

## Status

**Date**: 2026-03-06
**Tests**: 128/128 passing
**Coverage**: ~80%
**Error Tracking**: Sentry configured
