import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for CommonJS dependencies
export const runtime = 'nodejs';
// A slow tikwm response plus short-URL resolution can exceed the platform
// default timeout; give the route headroom so it isn't killed mid-fetch.
export const maxDuration = 60;

// Timeout for external API calls (30 seconds)
const API_TIMEOUT = 30000;
// TikTok resolution is retried with backoff on transient failures.
const MAX_TIKWM_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url) || /vm\.tiktok\.com/i.test(url);
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com/i.test(url);
}

async function resolveShortUrl(url: string): Promise<string> {
  // Short links (vm./vt.tiktok.com) can redirect through more than one hop.
  // Follow up to 5 hops; if resolution fails we fall back to the current URL
  // (tikwm can resolve short URLs itself, so this is best-effort).
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    if (!/(?:vm|vt)\.tiktok\.com/i.test(current)) break;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(current, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const location = response.headers.get('location');
      if (!location) break;
      // Resolve relative redirects against the current URL.
      current = new URL(location, current).toString();
      console.log('Resolved short URL hop', hop, '→', current);
    } catch (e) {
      console.error('Failed to resolve short URL hop', hop, e);
      break;
    }
  }
  return current;
}

type TikwmAttempt =
  | { ok: true; data: any }
  | { ok: false; retryable: boolean; status: number; message: string };

// A single tikwm resolution attempt, classified so the caller can decide
// whether to retry (transient) or fail fast (permanent, e.g. video not found).
async function attemptTikwm(resolvedUrl: string): Promise<TikwmAttempt> {
  const form = new URLSearchParams({ url: resolvedUrl, hd: '1' });
  let res: Response;
  try {
    res = await fetchWithTimeout('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (e: any) {
    const timedOut = e?.name === 'AbortError' || /abort/i.test(e?.message || '');
    return {
      ok: false,
      retryable: true,
      status: timedOut ? 504 : 502,
      message: timedOut ? 'Downloader timed out. Please try again.' : 'Could not reach the downloader. Please try again.',
    };
  }

  if (!res.ok) {
    console.error('TikWM API error:', res.status, res.statusText);
    // 5xx / 429 are transient and worth retrying; other 4xx are not.
    const retryable = res.status >= 500 || res.status === 429;
    return { ok: false, retryable, status: 502, message: 'Upstream service error' };
  }

  const json = await res.json();

  if (json.code !== 0) {
    console.error('TikWM error:', json);
    const errorMsg: string = json.msg || 'Failed to fetch TikTok video';
    const isRateLimit = /rate limit/i.test(errorMsg);
    const isNotFound = /not found/i.test(errorMsg);
    const isInvalid = /url parsing|invalid/i.test(errorMsg);
    let message = errorMsg;
    if (isNotFound) message = 'Video not found. The link may be private, deleted, or invalid.';
    else if (isRateLimit) message = 'Too many requests. Please wait a moment and try again.';
    else if (isInvalid) message = 'Invalid TikTok URL. Please check the link and try again.';
    // Only rate-limiting is transient; not-found / invalid are permanent.
    return { ok: false, retryable: isRateLimit, status: isRateLimit ? 429 : 400, message };
  }

  // Validate the payload actually contains a playable URL. tikwm sometimes
  // returns code:0 with empty play fields (photo posts / partial outages),
  // which would otherwise become a silently-broken canvas downstream.
  const data = json.data;
  const hasPlayable = [data?.play, data?.hdplay, data?.wmplay].some(
    (u) => typeof u === 'string' && /^https?:\/\//i.test(u)
  );
  if (!hasPlayable) {
    return { ok: false, retryable: true, status: 502, message: 'Downloader returned no playable video URL. Please try again.' };
  }

  return { ok: true, data };
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

      // Retry transient failures (rate limit / 5xx / network / empty payload)
      // with exponential backoff + jitter; fail fast on permanent errors.
      let result: TikwmAttempt | null = null;
      for (let attempt = 0; attempt < MAX_TIKWM_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await sleep(Math.min(2000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 200));
        }
        result = await attemptTikwm(resolvedUrl);
        if (result.ok) {
          console.log('TikTok video fetched successfully:', result.data?.id, attempt > 0 ? `(attempt ${attempt + 1})` : '');
          return NextResponse.json(result.data);
        }
        if (!result.retryable) break;
        console.warn(`[download] tikwm attempt ${attempt + 1}/${MAX_TIKWM_ATTEMPTS} failed (retryable): ${result.message}`);
      }

      return NextResponse.json({ error: result!.message }, { status: result!.status });
    }

    if (isInstagramUrl(trimmedUrl)) {
      // Instagram has no single reliable free extractor, so we try two with
      // different backends and take whichever first yields a playable URL:
      //   1. btch-downloader's igdl
      //   2. instagram-url-direct (catches some reels igdl can't)
      // Reels that Instagram blocks for datacenter IPs (private/restricted, or
      // anti-scraping) fail BOTH — those need a residential-proxy/paid API and
      // surface a clear 422 below rather than a silent blank.
      let igUrl = '';
      let igCover = '';

      // --- Attempt 1: igdl ---
      try {
        const { igdl } = await import('btch-downloader');
        const data = await igdl(trimmedUrl) as Awaited<ReturnType<InstagramDownloader>>;
        const first = data?.result?.find(
          (r) => r && typeof r.url === 'string' && /^https?:\/\//i.test(r.url)
        );
        if (first?.url) {
          igUrl = first.url;
          igCover = first.thumbnail || '';
        } else {
          console.warn('[download] igdl returned no usable URL, trying fallback');
        }
      } catch (e: any) {
        console.warn('[download] igdl threw, trying fallback:', e?.message || e);
      }

      // --- Attempt 2: instagram-url-direct (different backend) ---
      if (!igUrl) {
        try {
          const { instagramGetUrl } = await import('instagram-url-direct');
          const r = await instagramGetUrl(trimmedUrl);
          const videoDetail = (r.media_details || []).find(
            (m: any) => m?.type === 'video' && typeof m.url === 'string'
          );
          const candidate = videoDetail?.url || (r.url_list || [])[0];
          if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
            igUrl = candidate;
            igCover = videoDetail?.thumbnail || '';
            console.log('[download] Instagram fetched via instagram-url-direct fallback');
          }
        } catch (e: any) {
          console.warn('[download] instagram-url-direct fallback failed:', e?.message || e);
        }
      }

      // Both extractors failed — fail explicitly (no silent blank / stuck spinner).
      if (!/^https?:\/\//i.test(igUrl)) {
        console.error('[download] Instagram: no playable URL from either extractor for', trimmedUrl);
        return NextResponse.json(
          { error: 'Could not extract a video from this Instagram link. It may be private, download-restricted, or use licensed audio.' },
          { status: 422 }
        );
      }

      // Transform response to match the expected format
      const result = {
        id: Date.now().toString(),
        title: '',
        cover: igCover,
        author: {
          uniqueId: 'instagram',
          nickname: 'Instagram User',
          avatarThumb: '',
        },
        play: igUrl,
        wmplay: igUrl,
        hdplay: igUrl,
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
