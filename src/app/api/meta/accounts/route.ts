import { NextRequest, NextResponse } from 'next/server';
import { getAllAccounts } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

/**
 * GET /api/meta/accounts
 *
 * Returns list of all connected Instagram accounts for the account switcher UI
 * Does NOT include access tokens (security)
 */
export async function GET(request: NextRequest) {
  try {
    const accounts = await getAllAccounts();

    return NextResponse.json({
      accounts,
    });
  } catch (error: any) {
    console.error('[Meta Accounts] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
