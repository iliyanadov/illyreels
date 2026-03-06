import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    console.log('[Blob Delete] Deleting blob:', url);

    // Extract the key from the URL
    // URL format: https://[bucket].public.blob.vercel-storage.com/[key]
    const urlObj = new URL(url);
    const key = urlObj.pathname.slice(1); // Remove leading slash

    // Delete the blob
    await del(key);

    console.log('[Blob Delete] ✅ Successfully deleted:', key);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Blob Delete] Error:', error?.message || error);

    return NextResponse.json(
      { error: error.message || 'Failed to delete blob' },
      { status: 500 }
    );
  }
}
