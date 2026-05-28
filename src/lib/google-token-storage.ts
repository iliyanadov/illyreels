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

/**
 * Exchange a refresh token for a fresh access token. Updates the stored
 * cookie with the new access token. Throws if the refresh fails (e.g.,
 * the user revoked access or the refresh token is invalid).
 */
async function refreshAccessToken(token: GoogleToken): Promise<string> {
  if (!token.refreshToken) {
    throw new Error('No refresh token available — please reconnect Google.');
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client credentials are not configured.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[GoogleTokenStorage] Refresh failed:', res.status, body);
    throw new Error(`Token refresh failed (${res.status}). Please reconnect Google.`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Refresh response missing access_token.');
  }

  // Persist the new access token; keep the existing refresh token (Google does
  // not return a new one on refresh).
  await setGoogleToken({
    accessToken: data.access_token,
    refreshToken: token.refreshToken,
  });
  console.log('[GoogleTokenStorage] Access token refreshed');
  return data.access_token;
}

/**
 * Fetch a Google API with the stored access token. On 401 we transparently
 * refresh the access token using the stored refresh token and retry once.
 *
 * Callers should pass `init` exactly as they would to `fetch` — do NOT set an
 * Authorization header; this helper adds it.
 */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getGoogleToken();
  if (!token) {
    throw new Error('Not connected to Google. Please connect your account first.');
  }

  const buildHeaders = (accessToken: string): HeadersInit => ({
    ...(init.headers || {}),
    Authorization: `Bearer ${accessToken}`,
  });

  let response = await fetch(url, { ...init, headers: buildHeaders(token.accessToken) });

  // The stored access token has expired (Google returns 401). Use the refresh
  // token to mint a new one and retry the request once.
  if (response.status === 401) {
    console.log('[GoogleTokenStorage] Access token expired, refreshing...');
    const newAccessToken = await refreshAccessToken(token);
    response = await fetch(url, { ...init, headers: buildHeaders(newAccessToken) });
  }

  return response;
}
