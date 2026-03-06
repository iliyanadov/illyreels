import { NextRequest, NextResponse } from 'next/server';
import { setActiveAccount, getIgUsername } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

/**
 * POST /api/meta/switch
 *
 * Switches the active Instagram account
 *
 * Body: { "igUserId": "123" }
 *
 * Response (success):
 *   { "success": true, "igUserId": "123", "igUsername": "account_two" }
 *
 * Response (not found):
 *   { "error": "Account not found" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { igUserId } = body;

    if (!igUserId) {
      return NextResponse.json(
        { error: 'igUserId is required' },
        { status: 400 }
      );
    }

    const switched = await setActiveAccount(igUserId);

    if (!switched) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Get the new active account's username
    const username = await getIgUsername();

    return NextResponse.json({
      success: true,
      igUserId,
      igUsername: username || '',
    });
  } catch (error: any) {
    console.error('[Meta Switch] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to switch account' },
      { status: 500 }
    );
  }
}
