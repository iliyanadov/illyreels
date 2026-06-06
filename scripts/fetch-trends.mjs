// One-time fetcher: Google Trends "interest over time" for the artist roster,
// via SerpApi, anchor-normalised to a single shared 0..100 scale, written to
// public/trends-data.json. The web app reads that static file at runtime, so
// SerpApi is only ever hit when you run this script (not per page view).
//
//   1. Put SERPAPI_KEY in .env.local (or pass it inline)
//   2. node scripts/fetch-trends.mjs        (or: npm run fetch-trends)
//
// Cost: one SerpApi search per batch of <=5 terms. 16 artists -> ~4 searches.

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
const BATCH_OTHERS = 4 // + 1 anchor = 5 terms max per request

// Roster: spotify id (for name + avatar lookup) and the Trends search query.
// The anchor must be a high-search-volume artist present in every batch.
const ROSTER = [
  { id: '3TVXtAsR1Inumwj472S9r4', query: 'Drake', anchor: true },
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

// ---- main -------------------------------------------------------------------
async function main() {
  const apiKey = await resolveApiKey()
  if (!apiKey) {
    console.error('Missing SERPAPI_KEY (set it in .env.local or the environment).')
    process.exit(1)
  }

  const anchor = ROSTER.find((r) => r.anchor) || ROSTER[0]
  const others = ROSTER.filter((r) => r !== anchor)
  const batches = []
  for (let i = 0; i < others.length; i += BATCH_OTHERS) {
    batches.push(others.slice(i, i + BATCH_OTHERS))
  }

  const byId = {} // id -> { ts, vals }
  let canonicalAnchorAvg = null

  for (let b = 0; b < batches.length; b++) {
    const group = [anchor, ...batches[b]]
    const queries = group.map((g) => g.query)
    console.log(`[trends] batch ${b + 1}/${batches.length}: ${queries.join(', ')}`)
    const { ts, series } = await fetchTrendsBatch(queries, apiKey)

    const anchorAvg = mean(series[0]) || 1
    if (canonicalAnchorAvg == null) {
      canonicalAnchorAvg = anchorAvg
      byId[anchor.id] = { ts, vals: series[0] } // canonical anchor (batch 1)
    }
    const factor = canonicalAnchorAvg / anchorAvg // align this batch to batch 1
    for (let i = 1; i < group.length; i++) {
      byId[group[i].id] = { ts, vals: series[i].map((v) => v * factor) }
    }

    if (b < batches.length - 1) await sleep(1200) // be gentle on rate limits
  }

  // Renormalise so the global peak across all artists is 100.
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
