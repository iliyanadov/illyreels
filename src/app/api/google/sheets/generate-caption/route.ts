import { NextRequest, NextResponse } from 'next/server';
import { getGoogleToken, googleFetch } from '@/lib/google-token-storage';

export const runtime = 'nodejs';

// Instagram's hard caption limit is 2200 chars. We aim well under it in the
// prompt and enforce it as a hard cap below, since the model can't reliably
// count characters on its own.
const MAX_CAPTION_CHARS = 2200;

// Fixed prompt prefix — the topic from column F is appended to this.
const PROMPT_PREFIX =
  'Generate me an instagram caption, no emojis, in exactly 2 paragraphs, on this topic. ' +
  `Hard requirement: the entire caption must be at most ${MAX_CAPTION_CHARS - 200} characters ` +
  '(including spaces) — do not exceed this under any circumstances. Aim for roughly 1800 characters. ' +
  'Output only the caption text, nothing else. Topic:';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Trims a caption to the limit without cutting mid-sentence/word. Prefers the
// last sentence end, then the last space, before falling back to a hard slice.
function capCaption(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('\n')
  );
  if (lastSentence > max * 0.6) return slice.slice(0, lastSentence + 1).trim();
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > 0) return slice.slice(0, lastSpace).trim();
  return slice.trim();
}

// Generates an Instagram caption for a single sheet row:
//   1. Reads the topic from column F of `rowNumber`
//   2. Asks Gemini (with Google Search grounding) to write the caption
//   3. Writes the result back to column D of the same row
export async function POST(request: NextRequest) {
  const tokenData = await getGoogleToken();

  if (!tokenData) {
    return NextResponse.json(
      { error: 'Not connected to Google. Please connect your account first.' },
      { status: 401 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { spreadsheetId, sheetName, rowNumber } = body;

    if (!spreadsheetId || !sheetName || rowNumber === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: spreadsheetId, sheetName, rowNumber' },
        { status: 400 }
      );
    }

    // 1. Read the topic from column F (auto-refreshes the token on 401)
    const readRange = `${encodeURIComponent(sheetName)}!F${rowNumber}`;
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${readRange}`;

    const readRes = await googleFetch(readUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!readRes.ok) {
      const errorText = await readRes.text();
      console.error('[Generate Caption] Failed to read column F:', errorText);
      return NextResponse.json(
        { error: `Failed to read sheet: ${readRes.statusText}` },
        { status: readRes.status }
      );
    }

    const readData = await readRes.json();
    const topic = readData.values?.[0]?.[0]?.trim() || '';

    if (!topic) {
      // Nothing to generate from — let the client mark this row as skipped.
      return NextResponse.json({ skipped: true, rowNumber });
    }

    // 2. Generate the caption with Gemini, grounded with Google Search
    const prompt = `${PROMPT_PREFIX} ${topic}`;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error('[Generate Caption] Gemini API error:', errorText);
      return NextResponse.json(
        { error: `Gemini API error (${geminiRes.status})` },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const rawCaption = (geminiData.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();

    // Enforce the hard character cap regardless of what the model returned.
    const caption = capCaption(rawCaption, MAX_CAPTION_CHARS);
    if (caption.length < rawCaption.length) {
      console.log(
        '[Generate Caption] Row', rowNumber,
        `trimmed ${rawCaption.length} → ${caption.length} chars`
      );
    }

    if (!caption) {
      console.error('[Generate Caption] Empty Gemini response:', JSON.stringify(geminiData).slice(0, 500));
      return NextResponse.json(
        { error: 'Gemini returned an empty caption' },
        { status: 502 }
      );
    }

    // 3. Write the caption into column D
    const writeRange = `${encodeURIComponent(sheetName)}!D${rowNumber}`;
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`;

    const writeRes = await googleFetch(writeUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[caption]] }),
    });

    if (!writeRes.ok) {
      const errorText = await writeRes.text();
      console.error('[Generate Caption] Failed to write column D:', errorText);
      return NextResponse.json(
        { error: `Failed to write caption: ${writeRes.statusText}` },
        { status: writeRes.status }
      );
    }

    console.log('[Generate Caption] ✅ Row', rowNumber, '→ column D updated');
    return NextResponse.json({ success: true, rowNumber, caption });
  } catch (error: any) {
    console.error('[Generate Caption] Error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate caption' },
      { status: 500 }
    );
  }
}
