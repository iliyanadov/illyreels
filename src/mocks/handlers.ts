import { http, HttpResponse } from 'msw';

// TikTok Download API handler
export const tikwmHandlers = [
  http.post('https://www.tikwm.com/api/', async ({ request }) => {
    const body = await request.formData();
    const url = body.get('url') as string;

    // Simulate error for invalid URLs
    if (!url || !url.includes('tiktok.com')) {
      return HttpResponse.json(
        { code: -1, msg: 'Invalid TikTok URL' },
        { status: 400 }
      );
    }

    // Simulate video not found
    if (url.includes('not-found') || url.includes('deleted')) {
      return HttpResponse.json(
        { code: -1, msg: 'Video not found' },
        { status: 404 }
      );
    }

    // Simulate rate limit
    if (url.includes('rate-limit')) {
      return HttpResponse.json(
        { code: -1, msg: 'Api rate limit exceeded' },
        { status: 429 }
      );
    }

    // Success response
    return HttpResponse.json({
      code: 0,
      data: {
        id: '7234567890123456789',
        title: 'Test video description',
        cover: 'https://p16-sign.tiktokcdn.com/cover.jpg',
        author: {
          unique_id: 'testuser',
          nickname: 'Test User',
          avatar: 'https://p16-sign.tiktokcdn.com/avatar.jpg',
        },
        play: 'https://v16-webapp-prime.us.tiktok.com/video/sd.mp4',
        wmplay: 'https://v16-webapp-prime.us.tiktok.com/video/wm.mp4',
        hdplay: 'https://v16-webapp-prime.us.tiktok.com/video/hd.mp4',
        duration: 15,
        size: 2048576,
      },
    });
  }),

  // Handle short URL redirects
  http.get('https://vm.tiktok.com/*', async () => {
    return HttpResponse.json({
      code: 0,
      data: {
        id: '7234567890123456789',
        title: 'Short URL video',
        cover: 'https://p16-sign.tiktokcdn.com/cover.jpg',
        author: {
          unique_id: 'shortuser',
          nickname: 'Short User',
          avatar: 'https://p16-sign.tiktokcdn.com/avatar.jpg',
        },
        play: 'https://v16-webapp-prime.us.tiktok.com/video/sd.mp4',
        wmplay: 'https://v16-webapp-prime.us.tiktok.com/video/wm.mp4',
        hdplay: 'https://v16-webapp-prime.us.tiktok.com/video/hd.mp4',
        duration: 10,
        size: 1024000,
      },
    });
  }),

  http.get('https://vt.tiktok.com/*', async () => {
    return HttpResponse.json({
      code: 0,
      data: {
        id: '7234567890123456789',
        title: 'VT short URL video',
        cover: 'https://p16-sign.tiktokcdn.com/cover.jpg',
        author: {
          unique_id: 'vtuser',
          nickname: 'VT User',
          avatar: 'https://p16-sign.tiktokcdn.com/avatar.jpg',
        },
        play: 'https://v16-webapp-prime.us.tiktok.com/video/sd.mp4',
        wmplay: 'https://v16-webapp-prime.us.tiktok.com/video/wm.mp4',
        hdplay: 'https://v16-webapp-prime.us.tiktok.com/video/hd.mp4',
        duration: 12,
        size: 1500000,
      },
    });
  }),
];

// Instagram Graph API handlers
export const instagramHandlers = [
  // User info - unversioned endpoint (e.g., /me)
  http.get('https://graph.instagram.com/me', ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');

    if (!token || token === 'invalid') {
      return HttpResponse.json(
        { error: { message: 'Invalid token', type: 'OAuthException' } },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      id: '17841400123456789',
      username: 'testuser_business',
      account_type: 'BUSINESS',
    });
  }),

  // Publishing limit endpoint
  http.get('https://graph.instagram.com/*/*/content_publishing_limit', ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');

    if (!token || token === 'invalid') {
      return HttpResponse.json(
        { error: { message: 'Invalid token', type: 'OAuthException' } },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      data: [
        {
          config: {
            quota_total: 25,
            quota_duration: 86400,
          },
          quota_usage: 3,
        },
      ],
    });
  }),

  // Create media container
  http.post('https://graph.instagram.com/*/*/media', async ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');
    const videoUrl = url.searchParams.get('video_url');

    if (!token || token === 'invalid') {
      return HttpResponse.json(
        { error: { message: 'Invalid token', type: 'OAuthException' } },
        { status: 401 }
      );
    }

    // Simulate error for non-public URLs
    if (!videoUrl || videoUrl.includes('private')) {
      return HttpResponse.json(
        { error: { message: 'Video URL is not publicly accessible', type: 'ValidationError' } },
        { status: 400 }
      );
    }

    // Simulate quota exceeded
    if (token === 'quota-exceeded') {
      return HttpResponse.json(
        { error: { message: 'Quota exceeded', type: 'RateLimitError' } },
        { status: 403 }
      );
    }

    return HttpResponse.json({
      id: '90010123456789',
    });
  }),

  // Check container status
  http.get('https://graph.instagram.com/v*/*', ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');
    const fields = url.searchParams.get('fields');
    const pathname = url.pathname;
    const containerId = pathname.split('/').pop() || '';

    if (!token || token === 'invalid') {
      return HttpResponse.json(
        { error: { message: 'Invalid token', type: 'OAuthException' } },
        { status: 401 }
      );
    }

    // Only return status if fields include status
    if (fields?.includes('status_code') || fields?.includes('status')) {
      // Simulate error state
      if (containerId === 'error-container') {
        return HttpResponse.json({
          id: containerId,
          status_code: 'ERROR',
          status: 'Processing failed',
        });
      }

      // Simulate expired state
      if (containerId === 'expired-container') {
        return HttpResponse.json({
          id: containerId,
          status_code: 'EXPIRED',
          status: 'Container has expired',
        });
      }

      // Default: finished state
      return HttpResponse.json({
        id: containerId,
        status_code: 'FINISHED',
        status: 'Finished',
      });
    }

    return HttpResponse.json({
      id: containerId,
    });
  }),

  // Publish media
  http.post('https://graph.instagram.com/*/*/media_publish', async ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');
    const creationId = url.searchParams.get('creation_id');

    if (!token || token === 'invalid') {
      return HttpResponse.json(
        { error: { message: 'Invalid token', type: 'OAuthException' } },
        { status: 401 }
      );
    }

    // Simulate error for expired container
    if (creationId === 'expired-container') {
      return HttpResponse.json(
        { error: { message: 'Container has expired', type: 'GraphQLException' } },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      id: '17890012345678901',
    });
  }),

  // Token exchange (short-lived)
  http.post('https://api.instagram.com/oauth/access_token', async ({ request }) => {
    const body = await request.json() as any;
    if (!body) {
      return HttpResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
    const { appId, appSecret, code } = body;

    if (!appId || !appSecret || !code) {
      return HttpResponse.json(
        { error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    // Simulate error for invalid code
    if (code === 'invalid-code') {
      return HttpResponse.json(
        { error: 'Invalid authorization code' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      access_token: 'IGQVJWshort_lived_test_token',
      user_id: 17841400123456789,
    });
  }),

  // Token exchange (long-lived)
  http.get('https://graph.instagram.com/access_token', ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');
    const appSecret = url.searchParams.get('client_secret');

    if (!token || !appSecret) {
      return HttpResponse.json(
        { error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      access_token: 'IGQVJWlong_lived_test_token_valid_60_days',
      token_type: 'bearer',
      expires_in: 5184000,
    });
  }),

  // Refresh long-lived token
  http.get('https://graph.instagram.com/refresh_access_token', ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');

    if (!token) {
      return HttpResponse.json(
        { error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      access_token: 'IGQVJWrefreshed_long_lived_token',
      token_type: 'bearer',
      expires_in: 5184000,
    });
  }),
];

// Google API handlers
export const googleHandlers = [
  // Sheets API
  http.get('https://sheets.googleapis.com/v4/spreadsheets/*/values/*', ({ request }) => {
    const url = new URL(request.url);
    const spreadsheetId = url.pathname.split('/')[3];
    const range = url.pathname.split('/').pop();

    // Simulate error for invalid sheet ID
    if (spreadsheetId === 'invalid-sheet-id') {
      return HttpResponse.json(
        { error: { message: 'Invalid spreadsheet ID', code: 400 } },
        { status: 400 }
      );
    }

    // Simulate permission error
    if (spreadsheetId === 'no-permission') {
      return HttpResponse.json(
        { error: { message: 'Permission denied', code: 403 } },
        { status: 403 }
      );
    }

    // Parse sheet name from range
    const sheetName = range?.split('!')[0] || 'Sheet1';

    // Return mock data
    return HttpResponse.json({
      range: `${sheetName}!A4:D7`,
      majorDimension: 'ROWS',
      values: [
        ['https://www.tiktok.com/@user/video/123', 'Test Caption', 'film', 'Instagram caption here'],
        ['https://www.tiktok.com/@user/video/456', 'Another Caption', 'sports', 'Another IG caption'],
        ['', '', '', ''],
        ['https://www.tiktok.com/@user/video/789', 'Third Caption', '', ''],
      ],
    });
  }),

  // Google OAuth token exchange
  http.post('https://oauth2.googleapis.com/token', async ({ request }) => {
    const body = await request.json() as any;
    if (!body) {
      return HttpResponse.json(
        { error: 'invalid_request' },
        { status: 400 }
      );
    }
    const { code, client_id, client_secret } = body;

    if (!code || !client_id || !client_secret) {
      return HttpResponse.json(
        { error: 'invalid_request' },
        { status: 400 }
      );
    }

    // Simulate error for invalid code
    if (code === 'invalid-code') {
      return HttpResponse.json(
        { error: 'invalid_grant' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      access_token: 'ya29.test_google_access_token',
      refresh_token: '1//test_google_refresh_token',
      expires_in: 3600,
      token_type: 'Bearer',
    });
  }),

  // Google token info
  http.get('https://www.googleapis.com/oauth2/v3/tokeninfo', ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('access_token');

    if (!token || token === 'invalid') {
      return HttpResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      aud: 'test-client-id.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      expires_in: 3600,
    });
  }),
];

// DFlow Market API handlers
export const dflowHandlers = [
  http.get('https://c.prediction-markets-api.dflow.net/v1/events/:eventId', ({ params }) => {
    const eventId = params.eventId as string;

    // Simulate error for invalid event ID
    if (eventId === 'invalid-event') {
      return HttpResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      seriesTicker: 'TESTSERIES',
      subtitle: 'Test Series',
      ticker: eventId,
      title: 'Test Market Event',
      competition: 'Test Competition',
      competitionScope: 'global',
      imageUrl: 'https://example.com/market-image.jpg',
      liquidity: 1000000,
      markets: [
        {
          ticker: 'TESTMARKET-YES',
          title: 'Yes, it will happen',
          yesAsk: '0.65',
          yesBid: '0.63',
          noAsk: '0.37',
          noBid: '0.35',
          status: 'active',
          accounts: {},
          canCloseEarly: true,
          closeTime: Date.now() + 86400000,
          eventTicker: eventId,
          expirationTime: Date.now() + 86400000,
          marketType: 'BINARY',
          noSubTitle: 'No',
          openInterest: 50000,
          openTime: Date.now() - 86400000,
          result: 'PENDING',
          rulesPrimary: 'Standard rules',
          subtitle: 'Will it happen?',
          volume: 50000,
          volume24h: 12000,
          yesSubTitle: 'Yes',
        },
      ],
      openInterest: 100000,
      settlementSources: [
        { name: 'Test Source', url: 'https://example.com' },
      ],
      strikeDate: Date.now() + 86400000,
      strikePeriod: 'DAILY',
      volume: 50000,
      volume24h: 12000,
    });
  }),
];

// Vercel Blob upload handler
export const vercelBlobHandlers = [
  http.post('https://blob.vercel-storage.com/*', async ({ request }) => {
    const body = await request.json() as any;
    if (!body) {
      return HttpResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    if (!body.url) {
      return HttpResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      url: 'https://blob.vercel-storage.com/illyreels/test-video.mp4',
      downloadUrl: 'https://blob.vercel-storage.com/illyreels/test-video.mp4',
      size: 2048576,
      uploadedAt: Date.now(),
      pathname: '/illyreels/test-video.mp4',
    });
  }),
];

// TikTok CDN proxy handlers (for proxy API tests)
export const proxyCdnHandlers = [
  http.get('https://*.tikwm.com/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),

  http.get('https://*.tiktokcdn.com/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),

  http.get('https://*.tiktokv.com/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),

  http.get('https://*.tokcdn.com/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),

  http.get('https://*.muscdn.app/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),

  http.get('https://*.rapidcdn.app/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),

  http.get('https://*.cdninstagram.com/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),

  http.get('https://*.instagram.com/*', () => {
    return new HttpResponse('video data', {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': '100',
      },
    });
  }),
];

// Combine all handlers
export const handlers = [
  ...tikwmHandlers,
  ...instagramHandlers,
  ...googleHandlers,
  ...dflowHandlers,
  ...vercelBlobHandlers,
  ...proxyCdnHandlers,
];
