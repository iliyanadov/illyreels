import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export const runtime = 'nodejs';

interface SheetRow {
  url: string;
  caption: string;
  eventId?: string;
}

interface SheetsResponse {
  rows: SheetRow[];
  error?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accessToken = searchParams.get('access_token');
  const spreadsheetId = searchParams.get('spreadsheet_id');
  const startRow = searchParams.get('start_row') || '4';
  const endRow = searchParams.get('end_row') || '32';

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Access token is required' },
      { status: 401 }
    );
  }

  if (!spreadsheetId) {
    return NextResponse.json(
      { error: 'Spreadsheet ID is required' },
      { status: 400 }
    );
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch data from columns A (URL) and B (caption), rows 4-32
    // Using A1 notation: A4:B32
    const range = `Sheet1!A${startRow}:B${endRow}`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const values = response.data.values;

    if (!values || values.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    // Transform rows into the expected format
    const rows: SheetRow[] = values
      .map((row, index) => {
        const url = row[0]?.trim() || '';
        const caption = row[1]?.trim() || '';

        // Skip rows without URL
        if (!url) return null;

        return {
          url,
          caption,
          eventId: '', // Could add column C for event ID if needed
        };
      })
      .filter((row): row is SheetRow => row !== null);

    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error('Sheets API error:', error);

    if (error.response?.status === 401) {
      return NextResponse.json(
        { error: 'Access token expired. Please re-authenticate.' },
        { status: 401 }
      );
    }

    if (error.response?.status === 403) {
      return NextResponse.json(
        { error: 'Access denied. Please check you have access to this spreadsheet.' },
        { status: 403 }
      );
    }

    if (error.response?.status === 404) {
      return NextResponse.json(
        { error: 'Spreadsheet not found. Please check the ID.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch spreadsheet data' },
      { status: 500 }
    );
  }
}
