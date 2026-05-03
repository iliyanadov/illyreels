import { NextResponse } from 'next/server';
import { getIgUserId, getIgAccessToken } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

// TEMPORARY debug endpoint — exposes the connected IG creds so the owner can
// run manual `curl` tests against graph.instagram.com to isolate whether
// container ERROR is in the app pipeline or on Meta's side. Remove when done.
export async function GET() {
  const igUserId = await getIgUserId();
  const igAccessToken = await getIgAccessToken();
  if (!igUserId || !igAccessToken) {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 });
  }
  return NextResponse.json({ igUserId, igAccessToken });
}
