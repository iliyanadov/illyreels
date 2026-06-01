import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken, GoogleAuthError } from '@/lib/google-token-storage';
import { isAbortError } from '@/lib/fetch-timeout';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const tokenData = await getGoogleToken();

    if (!tokenData) {
      return NextResponse.json(
        { error: 'Not connected to Google' },
        { status: 401 }
      );
    }

    // Return only the access token (not the refresh token)
    return NextResponse.json({
      accessToken: tokenData.accessToken,
    });
  } catch (error: any) {
    console.error('[Google Token] Error:', error);

    // Refresh failed definitively — tell the client to reconnect Google.
    if (error instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: 'Please reconnect your Google account.' },
        { status: 401 }
      );
    }
    // Upstream timed out — surface as a gateway timeout.
    if (isAbortError(error)) {
      return NextResponse.json(
        { error: 'Google request timed out. Please try again.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get token' },
      { status: 500 }
    );
  }
}
