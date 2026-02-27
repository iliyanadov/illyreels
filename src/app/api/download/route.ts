import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for CommonJS dependencies
export const runtime = 'nodejs';

// Type definitions for the libraries
type TikTokDownloader = (url: string, options?: { version?: string }) => Promise<{
  status: string;
  result?: {
    videoHD?: string;
    video?: string;
    audio?: string;
    desc?: string;
    author?: {
      nickname: string;
      uniqueId: string;
      avatarThumb?: string;
    };
    cover?: string;
    duration?: number;
    size?: number;
    id?: string;
    images?: string[];
  };
  message?: string;
}>;

type InstagramDownloader = (url: string) => Promise<{
  result?: Array<{
    url: string;
    filename?: string;
    thumbnail?: string;
    type?: string;
  }>;
  error?: string;
}>;

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
      const response = await fetch(url, { redirect: 'manual' });
      const location = response.headers.get('location');
      if (location) return location;
    } catch {
      // If redirect fails, return original URL
    }
  }
  return url;
}

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

      // Dynamic import for CommonJS module
      const { Downloader } = await import('@tobyg74/tiktok-api-dl');
      const data = await Downloader(resolvedUrl, { version: 'v3' }) as Awaited<ReturnType<TikTokDownloader>>;

      if (data.status !== 'success' || !data.result) {
        return NextResponse.json({ error: data.message || 'Failed to fetch TikTok video' }, { status: 400 });
      }

      // Transform response to match the expected format
      const result = {
        id: data.result.id || '',
        title: data.result.desc || '',
        cover: data.result.cover || '',
        author: {
          uniqueId: data.result.author?.uniqueId || '',
          nickname: data.result.author?.nickname || '',
          avatarThumb: data.result.author?.avatarThumb || '',
        },
        play: data.result.video || '',
        wmplay: data.result.video || '',
        hdplay: data.result.videoHD || data.result.video || '',
        duration: data.result.duration || 0,
        size: data.result.size || 0,
        images: data.result.images || undefined,
      };

      return NextResponse.json(result);
    }

    if (isInstagramUrl(trimmedUrl)) {
      // Dynamic import for CommonJS module
      const { igdl } = await import('btch-downloader');
      const data = await igdl(trimmedUrl) as Awaited<ReturnType<InstagramDownloader>>;

      if (!data.result || data.result.length === 0) {
        return NextResponse.json({ error: data.error || 'Failed to fetch Instagram media' }, { status: 400 });
      }

      const firstResult = data.result[0];
      // Transform response to match the expected format (for Instagram reels)
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

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported URL. Please provide a TikTok or Instagram URL.' }, { status: 400 });
  } catch (error) {
    console.error('Download error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch video data';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
