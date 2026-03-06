import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken } from '@/lib/google-token-storage';

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
    return NextResponse.json(
      { error: 'Failed to get token' },
      { status: 500 }
    );
  }
}
