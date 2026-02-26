import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = [
  'tikwm.com',
  'tiktokcdn.com',
  'tiktokv.com',
  'tiktokcdn-us.com',
];

function isAllowedHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const filename = request.nextUrl.searchParams.get('filename') || 'tiktok-download';
  const stream = request.nextUrl.searchParams.get('stream') === '1';

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  if (!isAllowedHost(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
  }

  try {
    const upstreamHeaders: HeadersInit = { 'User-Agent': 'Mozilla/5.0' };
    const range = request.headers.get('Range');
    if (range) {
      upstreamHeaders['Range'] = range;
    }

    const upstream = await fetch(url, { headers: upstreamHeaders });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 });
    }

    const contentType = upstream.headers.get('Content-Type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('Content-Length');

    const headers = new Headers();
    if (!stream) {
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    }
    headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);

    // Preserve range-related headers for video playback when present
    const acceptRanges = upstream.headers.get('Accept-Ranges');
    const contentRange = upstream.headers.get('Content-Range');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    if (contentRange) headers.set('Content-Range', contentRange);

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ error: 'Proxy error' }, { status: 502 });
  }
}
