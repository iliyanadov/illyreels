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

  console.log('[Instagram Callback] Step 1: Exchange code for token');
  console.log('[Instagram Callback] redirectUri:', JSON.stringify(redirectUri));
  console.log('[Instagram Callback] appId:', appId);

  if (!appId || !appSecret || !redirectUri) {
    throw new Error('Missing Instagram app configuration');
  }

  const url = new URL('https://api.instagram.com/oauth/access_token');

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code: code,
  });

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Instagram Callback] Token exchange error:', error);
    throw new Error(`Step 1 failed: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Step 1 error: ${data.error_message || data.error.type || data.error}`);
  }

  console.log('[Instagram Callback] Step 1 success: Got short-lived token');
  return data;
}

/**
 * Exchange short-lived Instagram User Access Token for a long-lived one
 * Uses Instagram's Graph API endpoint
 */
async function getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
  console.log('[Instagram Callback] Step 2: Exchange for long-lived token');

  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', process.env.INSTAGRAM_APP_SECRET!);
  url.searchParams.set('access_token', shortLivedToken);

  console.log('[Instagram Callback] Calling:', 'https://graph.instagram.com/access_token');

  const response = await fetch(url.toString(), { method: 'GET' });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Instagram Callback] Long-lived token error:', error);
    throw new Error(`Step 2 failed: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Step 2 error: ${data.error.message || data.error.type || JSON.stringify(data.error)}`);
  }

  console.log('[Instagram Callback] Step 2 success: Got long-lived token');
  return data;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  console.log('[Instagram Callback] Called with code:', !!code, 'error:', error);

  // Handle OAuth errors from Instagram
  if (error) {
    console.error('[Instagram Callback] OAuth error:', error, errorReason);
    return errorPage(`OAuth denied: ${errorReason || error}`);
  }

  if (!code) {
    return errorPage('No authorization code received from Instagram');
  }

  try {
    // Step 1: Exchange code for short-lived token
    const { access_token: shortLivedToken } = await exchangeCodeForToken(code);

    // Step 2: Exchange for long-lived token
    const { access_token, expires_in } = await getLongLivedToken(shortLivedToken);

    // Step 3: Store the token
    const expiresAt = Math.floor(Date.now() / 1000) + (expires_in || 5184000);

    await setMetaToken({
      userAccessToken: access_token,
      expiresAt,
    });

    console.log('[Instagram Callback] Success! Token stored.');

    // Show success page with auto-redirect
    return successPage();

  } catch (error: any) {
    console.error('[Instagram Callback] Error:', error);
    return errorPage(error?.message || 'Unknown error');
  }
}

function errorPage(message: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Instagram Connection Error</title></head>
    <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #e11d48;">❌ Instagram Connection Failed</h1>
      <p style="font-size: 16px;"><strong>Error:</strong></p>
      <pre style="background: #fee2e2; padding: 16px; border-radius: 8px; overflow-x: auto;">${message}</pre>
      <p><a href="/" style="color: #3b82f6;">← Go back to illyreels</a></p>
    </body>
    </html>
  `;
  return new NextResponse(html, {
    status: 400,
    headers: { 'Content-Type': 'text/html' }
  });
}

function successPage() {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Instagram Connected</title></head>
    <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; text-align: center;">
      <h1 style="color: #10b981;">✅ Instagram Connected!</h1>
      <p style="font-size: 18px;">Your Instagram account has been connected successfully.</p>
      <p>Redirecting you back...</p>
      <script>
        setTimeout(() => { window.location.href = '/?meta=connected'; }, 1500);
      </script>
    </body>
    </html>
  `;
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}
