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
  'Before writing, you must use Google Search to look up current, accurate, up-to-date ' +
  'information about the topic, and base the caption on what you find — do not rely on prior knowledge alone. ' +
  `Hard requirement: the entire caption must be at most ${MAX_CAPTION_CHARS - 200} characters ` +
  '(including spaces) — do not exceed this under any circumstances. Aim for roughly 1800 characters. ' +
  'Output only the caption text, nothing else. Topic:';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Pool of Gemini API keys tried in priority order. Set GEMINI_API_KEYS to a
// comma-separated list (primary first); falls back to the single GEMINI_API_KEY.
// Each key should belong to a SEPARATE Google Cloud project, since free-tier
// rate limits are scoped per project — so the pool multiplies usable quota.
function getGeminiKeys(): string[] {
  const pool = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (pool.length) return pool;
  const single = process.env.GEMINI_API_KEY?.trim();
  return single ? [single] : [];
}

type GeminiResult =
  | { ok: true; caption: string; searchQueries: string[] }
  | { ok: false; rateLimited: boolean; status: number; detail: string };

// Calls Gemini with Google Search grounding using a specific API key. Returns
// the caption + the search queries it ran, or a structured failure (rateLimited
// flags 429/503 so the caller can rotate to the next key in the pool).
async function generateWithGemini(prompt: string, apiKey: string): Promise<GeminiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // 429 = rate limit / quota exhausted, 503 = model overloaded.
    const rateLimited = res.status === 429 || res.status === 503;
    return { ok: false, rateLimited, status: res.status, detail };
  }

  const data = await res.json();
  const searchQueries: string[] =
    data.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [];
  const caption = (data.candidates?.[0]?.content?.parts || [])
    .map((p: { text?: string }) => p.text || '')
    .join('')
    .trim();
  return { ok: true, caption, searchQueries };
}

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
//   2. Asks Gemini (with Google Search grounding) to write the caption,
//      rotating through the GEMINI_API_KEYS pool if a key is rate limited
//   3. Writes the result back to column D of the same row
export async function POST(request: NextRequest) {
  const tokenData = await getGoogleToken();

  if (!tokenData) {
    return NextResponse.json(
      { error: 'Not connected to Google. Please connect your account first.' },
      { status: 401 }
    );
  }

  const geminiKeys = getGeminiKeys();
  if (!geminiKeys.length) {
    return NextResponse.json(
      { error: 'No Gemini API keys configured (set GEMINI_API_KEYS or GEMINI_API_KEY).' },
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

    // 1. Read the existing caption (column D) and the topic (column F) in one
    // call (auto-refreshes the token on 401). Range D:F returns [D, E, F].
    const readRange = `${encodeURIComponent(sheetName)}!D${rowNumber}:F${rowNumber}`;
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${readRange}`;

    const readRes = await googleFetch(readUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!readRes.ok) {
      const errorText = await readRes.text();
      console.error('[Generate Caption] Failed to read columns D:F:', errorText);
      return NextResponse.json(
        { error: `Failed to read sheet: ${readRes.statusText}` },
        { status: readRes.status }
      );
    }

    const readData = await readRes.json();
    const cols: string[] = readData.values?.[0] ?? [];
    const existingCaption = (cols[0] ?? '').trim(); // column D
    const topic = (cols[2] ?? '').trim();           // column F

    if (existingCaption) {
      // Column D already has a caption — don't overwrite it. Skip this row.
      console.log('[Generate Caption] Row', rowNumber, '⏭️ already has a caption in column D — skipping');
      return NextResponse.json({ skipped: true, reason: 'exists', rowNumber });
    }

    if (!topic) {
      // Nothing to generate from — let the client mark this row as skipped.
      return NextResponse.json({ skipped: true, reason: 'no-topic', rowNumber });
    }

    // 2. Generate the caption with Gemini, grounded with Google Search. Try
    // each key in the pool in priority order, rotating to the next on failure
    // (e.g. when a key is rate limited / out of its daily quota).
    const prompt = `${PROMPT_PREFIX} ${topic}`;
    let result: Extract<GeminiResult, { ok: true }> | null = null;
    let usedKey = 0;
    let lastFailure: Extract<GeminiResult, { ok: false }> | null = null;

    for (let i = 0; i < geminiKeys.length; i++) {
      const attempt = await generateWithGemini(prompt, geminiKeys[i]);
      if (attempt.ok) {
        result = attempt;
        usedKey = i + 1;
        break;
      }
      lastFailure = attempt;
      const why = attempt.rateLimited ? `rate limited (${attempt.status})` : `error ${attempt.status}`;
      const more = i < geminiKeys.length - 1 ? ' — trying next key' : '';
      console.warn(`[Generate Caption] Row ${rowNumber} — Gemini key #${i + 1}/${geminiKeys.length} ${why}${more}`);
      if (!attempt.rateLimited) {
        console.error('[Generate Caption] Gemini detail:', attempt.detail.slice(0, 300));
      }
    }

    if (!result) {
      const status = lastFailure?.status ?? 502;
      const msg = lastFailure?.rateLimited
        ? `All ${geminiKeys.length} Gemini key(s) are rate limited (last status ${status})`
        : `Gemini API error (${status})`;
      console.error('[Generate Caption] Row', rowNumber, 'all keys failed:', msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Log which key served this row, and the grounding proof (the queries
    // Gemini ran, or a warning if it answered without searching).
    console.log(`[Generate Caption] Row ${rowNumber} — served by Gemini key #${usedKey}/${geminiKeys.length}`);
    if (result.searchQueries.length) {
      console.log('[Generate Caption] Row', rowNumber, '🔎 searched:', result.searchQueries.join(' | '));
    } else {
      console.warn('[Generate Caption] Row', rowNumber, '⚠️ no web search performed — caption is ungrounded');
    }

    const rawCaption = result.caption;

    // Enforce the hard character cap regardless of what the model returned.
    const caption = capCaption(rawCaption, MAX_CAPTION_CHARS);
    if (caption.length < rawCaption.length) {
      console.log(
        '[Generate Caption] Row', rowNumber,
        `trimmed ${rawCaption.length} → ${caption.length} chars`
      );
    }

    if (!caption) {
      console.error(`[Generate Caption] Empty Gemini response from key #${usedKey}`);
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

    console.log('[Generate Caption] ✅ Row', rowNumber, `→ column D updated (key #${usedKey})`);
    return NextResponse.json({ success: true, rowNumber, caption, keyUsed: usedKey });
  } catch (error: any) {
    console.error('[Generate Caption] Error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate caption' },
      { status: 500 }
    );
  }
}
