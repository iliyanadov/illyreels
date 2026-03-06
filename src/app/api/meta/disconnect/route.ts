import { NextRequest, NextResponse } from 'next/server';
import { clearMetaToken } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await clearMetaToken();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Meta Disconnect] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
