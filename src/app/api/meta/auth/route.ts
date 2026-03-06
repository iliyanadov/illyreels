import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Scopes for Instagram Business Login (Content Publishing)
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
];

export async function GET(request: NextRequest) {
  try {
    const appId = process.env.INSTAGRAM_APP_ID;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

    if (!appId) {
      return NextResponse.json(
        { error: 'INSTAGRAM_APP_ID not configured' },
        { status: 500 }
      );
    }

    if (!redirectUri) {
      return NextResponse.json(
        { error: 'INSTAGRAM_REDIRECT_URI not configured' },
        { status: 500 }
      );
    }

    // Generate a random state parameter for security
    const state = crypto.randomUUID();

    // Build the Instagram OAuth authorize URL (Business Login for Instagram)
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state: state,
    });

    // Instagram's OAuth authorize endpoint
    const authUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;

    console.log('[Instagram Auth] Generated OAuth URL');

    return NextResponse.json({
      url: authUrl,
      state,
    });
  } catch (error) {
    console.error('[Instagram Auth] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL' },
      { status: 500 }
    );
  }
}
