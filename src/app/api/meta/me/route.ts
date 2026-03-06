import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken, updateMetaToken } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

interface InstagramUser {
  id: string;
  username: string;
  account_type: string; // BUSINESS or MEDIA_CREATOR
}

/**
 * Fetch the authenticated Instagram user's info
 * This replaces the old /pages endpoint that discovered accounts via Facebook Pages
 */
async function getInstagramUser(accessToken: string): Promise<InstagramUser> {
  const graphVersion = process.env.META_GRAPH_VERSION || 'v22.0';

  // Get the user's Instagram business account
  // The fields endpoint returns the authenticated user's IG account info
  const url = new URL(`https://graph.facebook.com/${graphVersion}/me`);
  url.searchParams.set('fields', 'instagram_business_account{id,username,account_type}');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch user: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`API error: ${data.error.message || data.error.type}`);
  }

  if (!data.instagram_business_account) {
    throw new Error('No Instagram Business account found. Make sure your Instagram account is a Business or Creator account.');
  }

  return data.instagram_business_account;
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

    console.log('[Instagram Me] Fetching user info...');

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

    // If the error is about expired token, clear it
    if (error?.message?.includes('expired') || error?.message?.includes('token') || error?.message?.includes('authenticate')) {
      return NextResponse.json(
        { error: 'Your Instagram session has expired. Please reconnect your account.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to fetch Instagram user info' },
      { status: 500 }
    );
  }
}
