import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { setGoogleToken } from '@/lib/google-token-storage';

export const runtime = 'nodejs';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google/callback`
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return errorPage(`OAuth denied: ${error}`);
  }

  if (!code) {
    return errorPage('No authorization code received from Google');
  }

  try {
    console.log('[Google Callback] Exchanging code for tokens...');

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    if (!accessToken) {
      throw new Error('No access token received');
    }

    console.log('[Google Callback] Token exchange successful');

    // Store token in cookie
    await setGoogleToken({
      accessToken,
      refreshToken: refreshToken || undefined,
    });

    // Show success page with auto-redirect
    return successPage();

  } catch (error: any) {
    console.error('[Google Callback] Token exchange error:', error?.message || error);
    return errorPage(error?.message || 'Token exchange failed');
  }
}

function errorPage(message: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Google Connection Error</title></head>
    <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #e11d48;">❌ Google Connection Failed</h1>
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
    <head><title>Google Connected</title></head>
    <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; text-align: center;">
      <h1 style="color: #10b981;">✅ Google Connected!</h1>
      <p style="font-size: 18px;">Your Google account has been connected successfully.</p>
      <p>Redirecting you back...</p>
      <script>
        setTimeout(() => { window.location.href = '/?google=connected'; }, 1500);
      </script>
    </body>
    </html>
  `;
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}
