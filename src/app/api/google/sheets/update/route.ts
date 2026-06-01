import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken, googleFetch, GoogleAuthError } from '@/lib/google-token-storage';
import { isAbortError } from '@/lib/fetch-timeout';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const tokenData = await getGoogleToken();

  if (!tokenData) {
    return NextResponse.json(
      { error: 'Not connected to Google. Please connect your account first.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { spreadsheetId, sheetName, rowNumber, status } = body;

    if (!spreadsheetId || !sheetName || rowNumber === undefined || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: spreadsheetId, sheetName, rowNumber, status' },
        { status: 400 }
      );
    }

    // Update column E with the status
    const range = `${encodeURIComponent(sheetName)}!E${rowNumber}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

    const response = await googleFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: [[status]],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google Sheets Update] API error:', errorText);
      return NextResponse.json(
        { error: `Failed to update sheet: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[Google Sheets Update] Successfully updated row', rowNumber);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[Google Sheets Update] Error:', error?.message || error);

    // Refresh failed definitively — tell the client to reconnect Google.
    if (error instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: 'Please reconnect your Google account.' },
        { status: 401 }
      );
    }
    // Upstream timed out — surface as a gateway timeout.
    if (isAbortError(error)) {
      return NextResponse.json(
        { error: 'Google request timed out. Please try again.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update spreadsheet' },
      { status: 500 }
    );
  }
}
