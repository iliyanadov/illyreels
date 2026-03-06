import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken } from '@/lib/google-token-storage';

export const runtime = 'nodejs';

interface SheetRow {
  url: string;
  caption: string;
  tag: string;
}

export async function GET(request: NextRequest) {
  // Get token from cookie (server-side)
  const tokenData = await getGoogleToken();

  if (!tokenData) {
    return NextResponse.json(
      { error: 'Not connected to Google. Please connect your account first.' },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const spreadsheetId = searchParams.get('spreadsheet_id');
  const startRow = searchParams.get('start_row') || '4';
  const endRow = searchParams.get('end_row') || '32';
  const sheetName = searchParams.get('sheet_name') || 'Sheet1';

  if (!spreadsheetId) {
    return NextResponse.json(
      { error: 'Spreadsheet ID is required' },
      { status: 400 }
    );
  }

  try {
    const range = `${encodeURIComponent(sheetName)}!A${startRow}:C${endRow}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    console.log('[Google Sheets] Fetching from:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    console.log('[Google Sheets] API response status:', response.status);

    if (!response.ok) {
      console.error('[Google Sheets] API error response:', responseText);
      return NextResponse.json(
        { error: `API Error (${response.status}): ${responseText}` },
        { status: response.status }
      );
    }

    const data = JSON.parse(responseText);
    const values = data.values;

    if (!values || values.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    // Transform rows into the expected format
    const rows: SheetRow[] = values
      .map((row: string[]) => {
        const url = row[0]?.trim() || '';
        const caption = row[1]?.trim() || '';
        const tag = row[2]?.trim() || '';

        // Skip rows without URL
        if (!url) return null;

        return {
          url,
          caption,
          tag,
        };
      })
      .filter((row: SheetRow | null): row is SheetRow => row !== null);

    console.log('[Google Sheets] Successfully imported', rows.length, 'rows');

    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error('[Google Sheets] Fetch error:', error?.message || error);

    return NextResponse.json(
      { error: error.message || 'Failed to fetch spreadsheet data' },
      { status: 500 }
    );
  }
}
