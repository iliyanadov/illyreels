import { NextRequest, NextResponse } from 'next/server';
import { setMetaToken } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

/**
 * Exchange authorization code for a short-lived Instagram User Access Token
 */
async function exchangeCodeForToken(code: string): Promise<{ access_token: string; expires_in: number }> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error('Missing Instagram app configuration');
  }

  const url = new URL('https://api.instagram.com/oauth/access_token');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Token exchange error: ${data.error_message || data.error.type || data.error}`);
  }

  return data;
}

/**
 * Exchange short-lived Instagram User Access Token for a long-lived one
 * Uses Instagram's specific endpoint for long-lived user tokens
 */
async function getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
  const graphVersion = process.env.META_GRAPH_VERSION || 'v22.0';

  const url = new URL(`https://graph.facebook.com/${graphVersion}/access_token`);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', process.env.INSTAGRAM_APP_SECRET!);
  url.searchParams.set('access_token', shortLivedToken);

  const response = await fetch(url.toString(), { method: 'GET' });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Long-lived token request failed: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Long-lived token error: ${data.error.message || data.error.type}`);
  }

  return data;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');
  const state = searchParams.get('state');

  // Handle OAuth errors
  if (error) {
    console.error('[Instagram Callback] OAuth error:', error, errorReason);
    return NextResponse.redirect(
      new URL(`/?meta_error=${encodeURIComponent(errorReason || error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/?meta_error=no_code', request.url)
    );
  }

  try {
    console.log('[Instagram Callback] Exchanging code for token...');

    // Step 1: Exchange code for short-lived Instagram User Access Token
    const { access_token: shortLivedToken, expires_in: shortExpiresIn } = await exchangeCodeForToken(code);

    console.log('[Instagram Callback] Short-lived token received, expires in:', shortExpiresIn, 'seconds');

    // Step 2: Exchange short-lived token for long-lived Instagram User Access Token
    // Instagram user tokens are exchanged via a different grant_type
    const { access_token, expires_in } = await getLongLivedToken(shortLivedToken);

    console.log('[Instagram Callback] Long-lived token received, expires in:', expires_in, 'seconds');

    // Calculate expiration timestamp (Instagram long-lived tokens last ~60 days)
    const expiresAt = Math.floor(Date.now() / 1000) + (expires_in || 5184000);

    // Store the Instagram User Access Token
    await setMetaToken({
      userAccessToken: access_token,
      expiresAt,
    });

    console.log('[Instagram Callback] Token stored successfully');

    // Redirect back to app with success message
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('meta', 'connected');

    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error('[Instagram Callback] Error:', error?.message || error);
    return NextResponse.redirect(
      new URL(`/?meta_error=${encodeURIComponent(error?.message || 'callback_failed')}`, request.url)
    );
  }
}
