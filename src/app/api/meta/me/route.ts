import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken, updateMetaToken } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

interface InstagramUser {
  id: string;
  username: string;
  account_type?: string;
}

/**
 * Fetch the authenticated Instagram user's info
 * Uses Instagram Graph API (not Facebook)
 */
async function getInstagramUser(accessToken: string): Promise<InstagramUser> {
  // Use Instagram's Graph API to fetch user info
  const url = new URL('https://graph.instagram.com/me');
  url.searchParams.set('fields', 'id,username,account_type');
  url.searchParams.set('access_token', accessToken);

  console.log('[Instagram Me] Fetching from:', url.toString());

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch user: ${error}`);
  }

  const data = await response.json();

  console.log('[Instagram Me] Response:', JSON.stringify(data));

  if (data.error) {
    throw new Error(`API error: ${data.error.message || data.error.type || JSON.stringify(data.error)}`);
  }

  if (!data.id) {
    throw new Error('No user ID in response');
  }

  return data;
}

export async function GET(request: NextRequest) {
  try {
    // Get the stored token
    const token = await getMetaToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Not connected to Instagram. Please connect your account first.' },
        { status: 401 }
      );
    }

    console.log('[Instagram Me] Token exists, fetching user info...');

    const user = await getInstagramUser(token.userAccessToken);

    console.log('[Instagram Me] Found user:', user.username);

    // Store the igUserId in the token for later use
    await updateMetaToken({
      igUserId: user.id,
      igUsername: user.username,
    });

    return NextResponse.json({
      id: user.id,
      username: user.username,
      accountType: user.account_type,
    });
  } catch (error: any) {
    console.error('[Instagram Me] Error:', error?.message || error);

    return NextResponse.json(
      { error: error?.message || 'Failed to fetch Instagram user info' },
      { status: 500 }
    );
  }
}
