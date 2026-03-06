import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken } from '@/lib/google-token-storage';

export const runtime = 'nodejs';

interface SheetRow {
  url: string;
  caption: string;
  tag: string;
  instagramCaption: string;
  status: string; // Column E - status (e.g., "published")
  sheetRow: number; // The actual spreadsheet row number
}

export async function GET(request: NextRequest) {
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
    // Now fetch columns A:E (added column E for status)
    const range = `${encodeURIComponent(sheetName)}!A${startRow}:E${endRow}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    console.log('[Google Sheets] Fetching from:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[Google Sheets] API error response:', await response.text());
      return NextResponse.json(
        { error: `API Error (${response.status}): ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const values = data.values;

    if (!values || values.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const startRowNum = parseInt(startRow, 10);

    // Map columns: A=url, B=caption (heading), C=tag, D=instagramCaption, E=status
    const rows: SheetRow[] = values
      .map((row: string[], index: number) => {
        const url = row[0]?.trim() || '';
        const caption = row[1]?.trim() || '';          // Column B - Heading caption
        const tag = row[2]?.trim() || '';             // Column C - Tag
        const instagramCaption = row[3]?.trim() || ''; // Column D - Instagram caption
        const status = row[4]?.trim()?.toLowerCase() || ''; // Column E - Status

        // Skip rows without URL
        if (!url) return null;

        // Skip rows that are already published
        if (status === 'published') return null;

        return {
          url,
          caption,
          tag,
          instagramCaption,
          status,
          sheetRow: startRowNum + index, // Actual spreadsheet row number
        };
      })
      .filter((row: SheetRow | null): row is SheetRow => row !== null);

    console.log('[Google Sheets] Successfully imported', rows.length, 'rows (excluding published)');

    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error('[Google Sheets] Fetch error:', error?.message || error);

    return NextResponse.json(
      { error: error.message || 'Failed to fetch spreadsheet data' },
      { status: 500 }
    );
  }
}
