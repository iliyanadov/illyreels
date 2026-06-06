// One-time fetcher: Google Trends "interest over time" for the artist roster,
// via SerpApi, written to public/trends-data.json. The web app reads that static
// file at runtime, so SerpApi is only ever hit when you run this script (not per
// page view).
//
//   1. Put SERPAPI_KEY in .env.local (or pass it inline)
//   2. node scripts/fetch-trends.mjs        (or: npm run fetch-trends)
//
// ── Standardization (control-term method) ────────────────────────────────────
// A single Google Trends query is scaled 0..100 relative to its own peak, so two
// separate queries are NOT comparable. To make every artist comparable on one
// time-stable scale, each artist is queried ALONGSIDE four medical control terms
// whose true search volume is roughly constant across time and regions. Dividing
// the artist by the control baseline cancels the per-query scale factor, leaving
// a value proportional to true volume relative to that fixed medical baseline —
// comparable across artists and stable over time.
//
//   baseline_t   = mean(control terms' interest at month t)
//   standardized = ln(1 + artist_t / (baseline_t + 1))
//
// The ln(1 + …) compresses the dynamic range and stays ≥ 0 / defined even when
// interest is ~0 (this is steps 2 + 3 of the spec as written; the worked example
// just dropped the final +1, i.e. ln(17.5) vs ln(18.5) — the +1 matters only for
// near-zero artists). Finally every artist is scaled by ONE global factor so the
// roster peak reads 100 (a display scale that preserves cross-artist ratios).
//
// Cost: one SerpApi search per artist (artist + 4 controls = 5 terms, the max).
// 16 artists -> ~16 searches, run once.

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ---- config -----------------------------------------------------------------
// Timeframe. 'all' = monthly data back to 2004 (the earliest Google Trends has;
// there is no data before Jan 2004). Use 'today 5-y' for weekly/finer recent data.
const DATE_RANGE = 'all'
const GEO = '' // '' = worldwide
const INDEX_BACKEND = 'https://indextrading-production.up.railway.app'
const SERP_ENDPOINT = 'https://serpapi.com/search.json'

// Stable, low-volatility control terms. Their (roughly constant) search volume is
// the fixed yardstick that makes separate artist queries comparable. Keep at four
// so each query is artist + 4 controls = 5 terms (Google Trends' per-query max).
const CONTROL_TERMS = ['ankle sprain', 'wrist pain', 'broken bone', 'blurry vision']

// Roster: spotify id (for name + avatar lookup) and the Trends search query.
const ROSTER = [
  { id: '3TVXtAsR1Inumwj472S9r4', query: 'Drake' },
  { id: '5K4W6rqBFWDnAN6FQUkS6x', query: 'Kanye West' },
  { id: '2YZyLoL8N0Wb9xBt1NhZWg', query: 'Kendrick Lamar' },
  { id: '7tYKF4w9nC0nq9CsPZTHyP', query: 'SZA' },
  { id: '3DbwFQlvLxRSi2uX8mf81A', query: 'Sexyy Red' },
  { id: '3fMbdgg4jU18AjLCKBhRSm', query: 'Michael Jackson' },
  { id: '5pKCCKE2ajJHZ9KAiaK11H', query: 'Rihanna' },
  { id: '0du5cEVh5yTK9QJze8zA0C', query: 'Bruno Mars' },
  { id: '74KM79TiuVKeVCqs8QtB0B', query: 'Sabrina Carpenter' },
  { id: '1uNFoZAHBGtllmzznpCI3s', query: 'Justin Bieber' },
  { id: '1Xyo4u8uXC1ZmMpatF05PJ', query: 'The Weeknd' },
  { id: '699OTQXzgjhIYAHMy9RyPD', query: 'Playboi Carti' },
  { id: '4q3ewBCX7sLwd24euuV69X', query: 'Bad Bunny' },
  { id: '7dGJo4pcD2V6oG8kP0tJRR', query: 'Eminem' },
  { id: '0Y5tJX1MQlPlqiwlOH1tJY', query: 'Travis Scott' },
  { id: '1McMsnEElThX1knmY4oliG', query: 'Olivia Rodrigo' },
]

// ---- helpers ----------------------------------------------------------------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function resolveApiKey() {
  if (process.env.SERPAPI_KEY) return process.env.SERPAPI_KEY.trim()
  try {
    const txt = await readFile(path.join(ROOT, '.env.local'), 'utf-8')
    const m = txt.match(/^\s*SERPAPI_KEY\s*=\s*"?([^"\n#]+)"?/m)
    if (m) return m[1].trim()
  } catch {
    /* no .env.local */
  }
  return null
}

async function fetchArtistMeta(id) {
  try {
    const res = await fetch(`${INDEX_BACKEND}/api/artist/${id}?slim=true`)
    if (!res.ok) return null
    const a = (await res.json())?.artist
    return a ? { name: a.name, image_url: a.image_url ?? null } : null
  } catch {
    return null
  }
}

// One SerpApi google_trends TIMESERIES call for [artist, ...controls]. Returns
// the month timestamps (ms) and one value array per query term, in query order.
async function fetchTrendsBatch(queries, apiKey) {
  const url = new URL(SERP_ENDPOINT)
  url.searchParams.set('engine', 'google_trends')
  url.searchParams.set('data_type', 'TIMESERIES')
  url.searchParams.set('q', queries.join(','))
  url.searchParams.set('date', DATE_RANGE)
  if (GEO) url.searchParams.set('geo', GEO)
  url.searchParams.set('api_key', apiKey)

  const res = await fetch(url)
  const data = await res.json()
  if (data.error) throw new Error(`SerpApi: ${data.error}`)
  const timeline = data?.interest_over_time?.timeline_data
  if (!Array.isArray(timeline) || !timeline.length) {
    throw new Error('No timeline_data in SerpApi response')
  }

  // series[i] aligns with queries[i] (SerpApi preserves query order).
  const ts = []
  const series = queries.map(() => [])
  for (const pt of timeline) {
    ts.push(Number(pt.timestamp) * 1000) // -> ms
    for (let i = 0; i < queries.length; i++) {
      const v = pt.values?.[i]?.extracted_value
      series[i].push(typeof v === 'number' ? v : 0)
    }
  }
  return { ts, series }
}

// Standardize one artist against its control terms, month by month.
function standardize(series) {
  const artist = series[0]
  const controls = series.slice(1)
  return artist.map((a, t) => {
    const baseline = mean(controls.map((c) => c[t] ?? 0))
    return Math.log(1 + a / (baseline + 1))
  })
}

// ---- main -------------------------------------------------------------------
async function main() {
  const apiKey = await resolveApiKey()
  if (!apiKey) {
    console.error('Missing SERPAPI_KEY (set it in .env.local or the environment).')
    process.exit(1)
  }

  const byId = {} // id -> { ts, vals (standardized) }

  for (let i = 0; i < ROSTER.length; i++) {
    const r = ROSTER[i]
    const queries = [r.query, ...CONTROL_TERMS]
    console.log(`[trends] ${i + 1}/${ROSTER.length}: ${r.query} (vs ${CONTROL_TERMS.length} controls)`)
    try {
      const { ts, series } = await fetchTrendsBatch(queries, apiKey)
      byId[r.id] = { ts, vals: standardize(series) }
    } catch (e) {
      console.warn(`[trends] ${r.query} failed: ${e?.message || e}`)
    }
    if (i < ROSTER.length - 1) await sleep(1200) // be gentle on rate limits
  }

  // One global scale so the roster peak reads 100 (preserves cross-artist ratios).
  let globalMax = 0
  for (const id in byId) for (const v of byId[id].vals) if (v > globalMax) globalMax = v
  const norm = globalMax > 0 ? 100 / globalMax : 1

  const out = []
  for (const r of ROSTER) {
    const rec = byId[r.id]
    if (!rec) {
      console.warn(`[trends] no data for ${r.query} — skipping`)
      continue
    }
    const meta = (await fetchArtistMeta(r.id)) || { name: r.query, image_url: null }
    const data_points = rec.ts.map((t, i) => ({
      timestamp: new Date(t).toISOString(),
      index: Math.round(rec.vals[i] * norm * 100) / 100,
    }))
    const last = data_points.length ? data_points[data_points.length - 1].index : 0
    out.push({
      id: r.id,
      name: meta.name,
      image_url: meta.image_url,
      index_price: last,
      data_points,
    })
  }

  const outDir = path.join(ROOT, 'public')
  await mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'trends-data.json')
  await writeFile(outPath, JSON.stringify(out))
  console.log(`[trends] wrote ${out.length} artists -> ${path.relative(ROOT, outPath)}`)
}

main().catch((e) => {
  console.error('[trends] failed:', e?.message || e)
  process.exit(1)
})
