import { cookies } from 'next/headers';

export interface GoogleToken {
  accessToken: string;
  refreshToken?: string;
}

const COOKIE_NAME = 'google_token';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Encode data for storage in cookie (base64 encode)
 */
function encode(data: GoogleToken): string {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64');
}

/**
 * Decode data from cookie
 */
function decode(encoded: string): GoogleToken {
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(json) as GoogleToken;
  } catch (error) {
    console.error('[GoogleTokenStorage] Failed to decode token:', error);
    throw new Error('Invalid token data');
  }
}

/**
 * Store Google token in httpOnly cookie
 */
export async function setGoogleToken(token: GoogleToken): Promise<void> {
  const cookieStore = await cookies();

  const encoded = encode(token);

  cookieStore.set({
    name: COOKIE_NAME,
    value: encoded,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });

  console.log('[GoogleTokenStorage] Token stored in cookie');
}

/**
 * Get Google token from cookie
 */
export async function getGoogleToken(): Promise<GoogleToken | null> {
  try {
    const cookieStore = await cookies();
    const encoded = cookieStore.get(COOKIE_NAME)?.value;

    if (!encoded) {
      return null;
    }

    return decode(encoded);
  } catch (error) {
    console.error('[GoogleTokenStorage] Error getting token:', error);
    return null;
  }
}

/**
 * Clear Google token from cookie
 */
export async function clearGoogleToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  console.log('[GoogleTokenStorage] Token cleared from cookie');
}

/**
 * Check if user has a valid Google token
 */
export async function hasGoogleToken(): Promise<boolean> {
  const token = await getGoogleToken();
  return token !== null;
}
