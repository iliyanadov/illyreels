import { NextRequest, NextResponse } from 'next/server';
import { clearMetaToken, removeAccount, getAllAccounts } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

interface DisconnectRequestBody {
  igUserId?: string;
  all?: boolean;
}

/**
 * POST /api/meta/disconnect
 *
 * Supports two modes:
 * 1. Disconnect a specific account: { "igUserId": "123" }
 * 2. Disconnect all accounts: {} or { "all": true }
 *
 * Response: { "success": true, "remainingAccounts": number }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse body, handling empty body case
    let body: DisconnectRequestBody = {};
    try {
      body = await request.json();
    } catch {
      // Empty body - treat as disconnect all
      body = {};
    }

    const { igUserId } = body;

    if (igUserId) {
      // Disconnect a specific account
      await removeAccount(igUserId);

      // Get remaining count
      const accounts = await getAllAccounts();
      return NextResponse.json({
        success: true,
        remainingAccounts: accounts.length,
      });
    }

    // Disconnect all accounts
    await clearMetaToken();
    return NextResponse.json({
      success: true,
      remainingAccounts: 0,
    });
  } catch (error: any) {
    console.error('[Meta Disconnect] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
