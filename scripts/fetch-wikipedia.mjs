// One-time fetcher: daily Wikipedia pageviews for the artist roster (a free,
// no-key popularity proxy with daily granularity back to 2015-07). Each artist
// is normalised to 0..100 by its own 99th percentile (robust to one-day news
// spikes), then written to public/artist-data.json in a COMPACT shape
// ({ start, values[] }) so 11 years of daily data stays a small file.
//
//   node scripts/fetch-wikipedia.mjs     (or: npm run fetch-pageviews)
//
// No API key. ~16 requests (one per artist) + 16 avatar lookups. Free.

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ---- config -----------------------------------------------------------------
const START_ISO = '2015-07-01' // Wikipedia pageviews API begins 2015-07-01
const UA = 'illyreels/1.0 (https://illyreels.vercel.app; ihevgun@gmail.com)'
const INDEX_BACKEND = 'https://indextrading-production.up.railway.app'
const WIKI =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user'
const DAY = 86400000

// spotify id (for name + avatar) -> Wikipedia article title.
const ROSTER = [
  { id: '3TVXtAsR1Inumwj472S9r4', wiki: 'Drake_(musician)' },
  { id: '5K4W6rqBFWDnAN6FQUkS6x', wiki: 'Kanye_West' },
  { id: '2YZyLoL8N0Wb9xBt1NhZWg', wiki: 'Kendrick_Lamar' },
  { id: '7tYKF4w9nC0nq9CsPZTHyP', wiki: 'SZA' },
  { id: '3DbwFQlvLxRSi2uX8mf81A', wiki: 'Sexyy_Red' },
  { id: '3fMbdgg4jU18AjLCKBhRSm', wiki: 'Michael_Jackson' },
  { id: '5pKCCKE2ajJHZ9KAiaK11H', wiki: 'Rihanna' },
  { id: '0du5cEVh5yTK9QJze8zA0C', wiki: 'Bruno_Mars' },
  { id: '74KM79TiuVKeVCqs8QtB0B', wiki: 'Sabrina_Carpenter' },
  { id: '1uNFoZAHBGtllmzznpCI3s', wiki: 'Justin_Bieber' },
  { id: '1Xyo4u8uXC1ZmMpatF05PJ', wiki: 'The_Weeknd' },
  { id: '699OTQXzgjhIYAHMy9RyPD', wiki: 'Playboi_Carti' },
  { id: '4q3ewBCX7sLwd24euuV69X', wiki: 'Bad_Bunny' },
  { id: '7dGJo4pcD2V6oG8kP0tJRR', wiki: 'Eminem' },
  { id: '0Y5tJX1MQlPlqiwlOH1tJY', wiki: 'Travis_Scott' },
  { id: '1McMsnEElThX1knmY4oliG', wiki: 'Olivia_Rodrigo' },
]

// ---- helpers ----------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const yyyymmdd = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

async function fetchMeta(id) {
  try {
    const res = await fetch(`${INDEX_BACKEND}/api/artist/${id}?slim=true`)
    if (!res.ok) return null
    const a = (await res.json())?.artist
    return a ? { name: a.name, image_url: a.image_url ?? null } : null
  } catch {
    return null
  }
}

// date(YYYYMMDDHH from API timestamp) -> views, as a Map of 'YYYY-MM-DD' -> n.
async function fetchPageviews(wiki, startStr, endStr) {
  const url = `${WIKI}/${encodeURIComponent(wiki)}/daily/${startStr}/${endStr}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (res.status === 404) return new Map()
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  const map = new Map()
  for (const it of data.items || []) {
    const t = it.timestamp // YYYYMMDDHH
    map.set(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`, it.views)
  }
  return map
}

function percentile(valuesAsc, p) {
  if (!valuesAsc.length) return 0
  const idx = Math.min(valuesAsc.length - 1, Math.floor(p * (valuesAsc.length - 1)))
  return valuesAsc[idx]
}

// ---- main -------------------------------------------------------------------
async function main() {
  const startMs = Date.parse(`${START_ISO}T00:00:00Z`)
  const todayMs = Date.now()
  const N = Math.floor((todayMs - startMs) / DAY) + 1 // contiguous day count
  const endStr = yyyymmdd(todayMs)
  const startStr = yyyymmdd(startMs)

  const out = []
  for (const r of ROSTER) {
    process.stdout.write(`[wiki] ${r.wiki} ... `)
    let map = null
    for (let attempt = 0; attempt < 3 && !map; attempt++) {
      if (attempt) await sleep(800)
      try {
        map = await fetchPageviews(r.wiki, startStr, endStr)
      } catch (e) {
        if (attempt === 2) console.log('FAIL', e.message)
      }
    }
    if (!map) continue
    if (!map.size) {
      console.log('no data')
      continue
    }

    // Contiguous daily array (missing days -> 0), aligned to a common start.
    const raw = new Array(N)
    for (let i = 0; i < N; i++) {
      const d = new Date(startMs + i * DAY)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`
      raw[i] = map.get(key) ?? 0
    }

    // Per-artist normalise to 0..100 by the 99th percentile (spike-robust).
    const p99 = percentile([...raw].sort((a, b) => a - b), 0.99) || Math.max(...raw) || 1
    const values = raw.map((v) => Math.round(Math.min(100, (v / p99) * 100) * 10) / 10)

    const meta = (await fetchMeta(r.id)) || { name: r.wiki.replace(/_/g, ' '), image_url: null }
    out.push({
      id: r.id,
      name: meta.name,
      image_url: meta.image_url,
      index_price: values[values.length - 1],
      start: START_ISO,
      values,
    })
    console.log(`${N} days (p99=${p99})`)
    await sleep(300)
  }

  await mkdir(path.join(ROOT, 'public'), { recursive: true })
  const outPath = path.join(ROOT, 'public', 'artist-data.json')
  await writeFile(outPath, JSON.stringify(out))
  console.log(`[wiki] wrote ${out.length} artists -> ${path.relative(ROOT, outPath)}`)
}

main().catch((e) => {
  console.error('[wiki] failed:', e?.message || e)
  process.exit(1)
})
