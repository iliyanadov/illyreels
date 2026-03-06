import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken } from '@/lib/google-token-storage';

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

    console.log('[Google Sheets Update] Updating row', rowNumber, 'to status:', status);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json',
      },
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

    return NextResponse.json(
      { error: error.message || 'Failed to update spreadsheet' },
      { status: 500 }
    );
  }
}
