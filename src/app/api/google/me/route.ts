import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken, clearGoogleToken } from '@/lib/google-token-storage';

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
