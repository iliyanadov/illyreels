import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken, getIgUserId, getIgAccessToken } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v22.0';
const MAX_POLL_ATTEMPTS = 60; // ~5 minutes at 5s intervals
const POLL_INTERVAL = 5000; // 5 seconds

interface PublishRequest {
  caption?: string;
  shareToFeed?: boolean;
  videoUrl: string;
}

interface PublishResponse {
  containerId: string;
  mediaId: string;
}

/**
 * Create a media container for the Instagram Reel
 */
async function createContainer(
  igUserId: string,
  videoUrl: string,
  caption: string,
  shareToFeed: boolean,
  igAccessToken: string
): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`);
  url.searchParams.set('media_type', 'REELS');
  url.searchParams.set('video_url', videoUrl);
  url.searchParams.set('caption', caption);
  url.searchParams.set('share_to_feed', shareToFeed ? 'true' : 'false');
  url.searchParams.set('access_token', igAccessToken);

  console.log('[Reels Publish] Creating container...');

  const response = await fetch(url.toString(), { method: 'POST' });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create container: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Container creation error: ${data.error.message || data.error.type}`);
  }

  const containerId = data.id;
  console.log('[Reels Publish] Container created:', containerId);

  return containerId;
}

/**
 * Poll the container status until it's FINISHED or ERROR
 */
async function waitForContainerReady(
  containerId: string,
  igAccessToken: string
): Promise<void> {
  console.log('[Reels Publish] Waiting for container to be ready...');

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${containerId}`);
    url.searchParams.set('fields', 'status_code,status');
    url.searchParams.set('access_token', igAccessToken);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to check container status: ${error}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Status check error: ${data.error.message || data.error.type}`);
    }

    const statusCode = data.status_code;
    console.log(`[Reels Publish] Container status: ${statusCode} (attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS})`);

    if (statusCode === 'FINISHED') {
      console.log('[Reels Publish] Container is ready');
      return;
    }

    if (statusCode === 'ERROR') {
      throw new Error(`Container processing failed: ${data.status || 'Unknown error'}`);
    }

    if (statusCode === 'EXPIRED') {
      throw new Error('Container has expired. Please try uploading again.');
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error('Container processing timed out. Please try again.');
}

/**
 * Publish the container to Instagram
 */
async function publishContainer(
  igUserId: string,
  containerId: string,
  igAccessToken: string
): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`);
  url.searchParams.set('creation_id', containerId);
  url.searchParams.set('access_token', igAccessToken);

  console.log('[Reels Publish] Publishing container...');

  const response = await fetch(url.toString(), { method: 'POST' });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to publish: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Publish error: ${data.error.message || data.error.type}`);
  }

  const mediaId = data.id;
  console.log('[Reels Publish] Published successfully, media ID:', mediaId);

  return mediaId;
}

export async function POST(request: NextRequest) {
  try {
    // Get the stored Instagram user access token
    const igUserId = await getIgUserId();
    const igAccessToken = await getIgAccessToken();

    if (!igUserId || !igAccessToken) {
      return NextResponse.json(
        { error: 'No Instagram account connected. Please connect your account first.' },
        { status: 401 }
      );
    }

    const body = await request.json() as PublishRequest;

    const { caption = '', shareToFeed = false, videoUrl } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'videoUrl is required' },
        { status: 400 }
      );
    }

    console.log('[Reels Publish] Starting publish workflow...');
    console.log('[Reels Publish] IG User ID:', igUserId);
    console.log('[Reels Publish] Video URL:', videoUrl);
    console.log('[Reels Publish] Caption:', caption.substring(0, 50) + '...');
    console.log('[Reels Publish] Share to feed:', shareToFeed);

    // Step 1: Create container
    const containerId = await createContainer(
      igUserId,
      videoUrl,
      caption,
      shareToFeed,
      igAccessToken
    );

    // Step 2: Wait for container to be ready
    await waitForContainerReady(containerId, igAccessToken);

    // Step 3: Publish the reel
    const mediaId = await publishContainer(igUserId, containerId, igAccessToken);

    const result: PublishResponse = {
      containerId,
      mediaId,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Reels Publish] Error:', error?.message || error);

    // Check for authentication errors
    if (error?.message?.includes('token') || error?.message?.includes('authentication') || error?.message?.includes('OAuth')) {
      return NextResponse.json(
        { error: 'Authentication failed. Please reconnect your Instagram account.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to publish reel' },
      { status: 500 }
    );
  }
}
