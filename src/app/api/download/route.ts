import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for CommonJS dependencies
export const runtime = 'nodejs';

// Timeout for external API calls (30 seconds)
const API_TIMEOUT = 30000;

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url) || /vm\.tiktok\.com/i.test(url);
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com/i.test(url);
}

async function resolveShortUrl(url: string): Promise<string> {
  // Follow redirects for short URLs
  if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const location = response.headers.get('location');
      if (location) {
        console.log('Resolved short URL:', url, '→', location);
        return location;
      }
    } catch (e) {
      console.error('Failed to resolve short URL:', e);
    }
  }
  return url;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = API_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

type InstagramDownloader = (url: string) => Promise<{
  result?: Array<{
    url: string;
    filename?: string;
    thumbnail?: string;
    type?: string;
  }>;
  error?: string;
}>;

export async function POST(request: NextRequest) {
  let url: string;
  try {
    const body = await request.json();
    url = body.url;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!url?.trim()) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const trimmedUrl = url.trim();

  try {
    // Detect platform
    if (isTikTokUrl(trimmedUrl)) {
      // Resolve short URL first
      const resolvedUrl = await resolveShortUrl(trimmedUrl);

      // Use tikwm.com API for TikTok (more reliable)
      const form = new URLSearchParams({ url: resolvedUrl, hd: '1' });

      const res = await fetchWithTimeout('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });

      if (!res.ok) {
        console.error('TikWM API error:', res.status, res.statusText);
        return NextResponse.json({ error: 'Upstream service error' }, { status: 502 });
      }

      const json = await res.json();

      if (json.code !== 0) {
        console.error('TikWM error:', json);
        return NextResponse.json({ error: json.msg || 'Failed to fetch TikTok video' }, { status: 400 });
      }

      console.log('TikTok video fetched successfully:', json.data?.id);
      return NextResponse.json(json.data);
    }

    if (isInstagramUrl(trimmedUrl)) {
      // Dynamic import for CommonJS module
      const { igdl } = await import('btch-downloader');

      // Add timeout for Instagram fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const data = await igdl(trimmedUrl) as Awaited<ReturnType<InstagramDownloader>>;
      clearTimeout(timeoutId);

      if (!data.result || data.result.length === 0) {
        return NextResponse.json({ error: data.error || 'Failed to fetch Instagram media' }, { status: 400 });
      }

      const firstResult = data.result[0];
      // Transform response to match the expected format
      const result = {
        id: Date.now().toString(),
        title: '',
        cover: firstResult.thumbnail || '',
        author: {
          uniqueId: 'instagram',
          nickname: 'Instagram User',
          avatarThumb: '',
        },
        play: firstResult.url || '',
        wmplay: firstResult.url || '',
        hdplay: firstResult.url || '',
        duration: 0,
        size: 0,
      };

      console.log('Instagram video fetched successfully');
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported URL. Please provide a TikTok or Instagram URL.' }, { status: 400 });
  } catch (error: any) {
    console.error('Download error:', error?.message || error);

    if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
      return NextResponse.json({ error: 'Request timeout. The server took too long to respond.' }, { status: 504 });
    }

    const message = error instanceof Error ? error.message : 'Failed to fetch video data';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
