import { cookies } from 'next/headers';

export interface StoredToken {
  userAccessToken: string; // Instagram User Access Token
  igUserId?: string;       // Instagram User ID (discovered after connection)
  igUsername?: string;     // Instagram username (for display)
  expiresAt?: number;      // Token expiration timestamp
}

const COOKIE_NAME = 'meta_token';
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days in seconds (matches long-lived token duration)

/**
 * Encode data for storage in cookie (base64 encode)
 */
function encode(data: StoredToken): string {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64');
}

/**
 * Decode data from cookie
 */
function decode(encoded: string): StoredToken {
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(json) as StoredToken;
  } catch (error) {
    console.error('[MetaTokenStorage] Failed to decode token:', error);
    throw new Error('Invalid token data');
  }
}

/**
 * Store Instagram token in httpOnly cookie
 */
export async function setMetaToken(token: StoredToken): Promise<void> {
  const cookieStore = await cookies();

  const encoded = encode(token);
  const expiresAt = token.expiresAt
    ? new Date(token.expiresAt * 1000)
    : new Date(Date.now() + MAX_AGE * 1000);

  cookieStore.set({
    name: COOKIE_NAME,
    value: encoded,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  console.log('[MetaTokenStorage] Token stored in cookie');
}

/**
 * Get Instagram token from cookie
 */
export async function getMetaToken(): Promise<StoredToken | null> {
  try {
    const cookieStore = await cookies();
    const encoded = cookieStore.get(COOKIE_NAME)?.value;

    if (!encoded) {
      return null;
    }

    const token = decode(encoded);

    // Check if token is expired
    if (token.expiresAt && Date.now() > token.expiresAt * 1000) {
      console.log('[MetaTokenStorage] Token expired, clearing');
      await clearMetaToken();
      return null;
    }

    return token;
  } catch (error) {
    console.error('[MetaTokenStorage] Error getting token:', error);
    return null;
  }
}

/**
 * Update specific fields in the stored token
 */
export async function updateMetaToken(updates: Partial<StoredToken>): Promise<void> {
  const existing = await getMetaToken();

  if (!existing) {
    throw new Error('No token found to update');
  }

  const updated: StoredToken = {
    ...existing,
    ...updates,
  };

  await setMetaToken(updated);
}

/**
 * Clear Instagram token from cookie
 */
export async function clearMetaToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  console.log('[MetaTokenStorage] Token cleared from cookie');
}

/**
 * Check if user has a valid Instagram token
 */
export async function hasMetaToken(): Promise<boolean> {
  const token = await getMetaToken();
  return token !== null;
}

/**
 * Get the Instagram user ID from stored token
 */
export async function getIgUserId(): Promise<string | null> {
  const token = await getMetaToken();
  return token?.igUserId || null;
}

/**
 * Get the Instagram user access token (same as user token for Instagram Login)
 */
export async function getIgAccessToken(): Promise<string | null> {
  const token = await getMetaToken();
  return token?.userAccessToken || null;
}
