import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken, clearGoogleToken, GoogleAuthError } from '@/lib/google-token-storage';
import { isAbortError } from '@/lib/fetch-timeout';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = await getGoogleToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Not connected to Google. Please connect your account first.' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      connected: true,
    });
  } catch (error: any) {
    console.error('[Google Me] Error:', error?.message || error);

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
      { error: error?.message || 'Failed to check Google connection' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await clearGoogleToken();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
