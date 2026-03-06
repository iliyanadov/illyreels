import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken, getIgUserId, getIgAccessToken } from '@/lib/meta-token-storage';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const igUserId = await getIgUserId();
    const igAccessToken = await getIgAccessToken();

    if (!igUserId || !igAccessToken) {
      return NextResponse.json(
        { error: 'Not connected to Instagram' },
        { status: 401 }
      );
    }

    const graphVersion = process.env.META_GRAPH_VERSION || 'v22.0';
    const url = new URL(`https://graph.instagram.com/${graphVersion}/${igUserId}/content_publishing_limit`);
    url.searchParams.set('fields', 'config,quota_usage');
    url.searchParams.set('access_token', igAccessToken);

    console.log('[Publishing Limit] Fetching for IG User ID:', igUserId);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.text();
      console.error('[Publishing Limit] Error:', error);
      throw new Error(`Failed to fetch publishing limit: ${error}`);
    }

    const data = await response.json();
    console.log('[Publishing Limit] Raw response:', JSON.stringify(data));

    if (data.error) {
      throw new Error(data.error.message || data.error.type || 'Failed to fetch publishing limit');
    }

    // Extract values from nested structure: { data: [{ config: { quota_total, quota_duration }, quota_usage }] }
    let configTotal = 25; // Default fallback
    let quotaUsage = 0;

    if (data.data && Array.isArray(data.data) && data.data[0]) {
      const firstItem = data.data[0];
      if (firstItem.config && typeof firstItem.config.quota_total === 'number') {
        configTotal = firstItem.config.quota_total;
      }
      if (typeof firstItem.quota_usage === 'number') {
        quotaUsage = firstItem.quota_usage;
      }
    }

    console.log('[Publishing Limit] Parsed:', { config: configTotal, quota_usage: quotaUsage });

    // Return flat structure that the component expects
    return NextResponse.json({
      config: configTotal,
      quota_usage: quotaUsage,
    });
  } catch (error: any) {
    console.error('[Publishing Limit] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch publishing limit' },
      { status: 500 }
    );
  }
}
