'use client'

/**
 * Sonotrade landing page — fully self-contained port.
 *
 * Everything below — design tokens, SVG graphics, scroller, chart, radar,
 * waitlist modal — lives in this single file. No external imports beyond
 * React. Drop into any Next 13+ app at app/<route>/page.tsx.
 *
 * Simplifications vs original:
 *  - No @number-flow/react (animated digit rolling becomes a smooth fade).
 *  - No /st-glyph.png (logo is text-only; monogram bg is a CSS dot grid).
 *  - All design tokens are inline constants, not CSS variables.
 *  - All Tailwind classes from the original have been replaced with inline
 *    styles so this file is independent of Tailwind config / theme tokens.
 *
 * The hero/top-artist sections still fetch from /api/artist and /api/artists.
 * In an app without those endpoints the hero stays hidden and the top list
 * never appears — but the rest of the page renders fine.
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

// ───────────────────────────────────────────────────────────────────────────
//   Design tokens
// ───────────────────────────────────────────────────────────────────────────

const BG = 'rgb(10,10,10)'
const WHITE = '#ffffff'
const SEC = '#a1a1aa'
const MUTED = '#71717a'
const BORDER = '#27272a'
const BORDER_STRONG = '#3f3f46'
const SURFACE = '#18181b'
const POSITIVE = '#04df9d'
const NEGATIVE = '#FF4B4B'
const FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const MONO = '"SF Mono", ui-monospace, "Cascadia Code", Menlo, monospace'
const MAX_W = 1300

// ───────────────────────────────────────────────────────────────────────────
//   Hero artist fetching (Spotify IDs come from the original landing site)
// ───────────────────────────────────────────────────────────────────────────

const HERO_IDS = [
  '3TVXtAsR1Inumwj472S9r4', // Drake
  '53XhwfbYqKCa1cC15pYq2q', // Imagine Dragons
  '06HL4z0CvFAxyc27GXpf02', // Taylor Swift
  '2YZyLoL8N0Wb9xBt1NhZWg', // Kendrick Lamar
  '6qqNVTkY8uBg9cP3Jd7DAH', // Billie Eilish
]
const HERO_INTERVAL_MS = 12000

interface DataPoint {
  index: number
  timestamp: string
}
interface ArtistData {
  name: string
  data_points: DataPoint[]
  image_url?: string | null
  index_price?: number | null
}

function useHeroArtists() {
  const [artists, setArtists] = useState<ArtistData[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      HERO_IDS.map(async (id) => {
        try {
          const res = await fetch(
            `/api/artist/${encodeURIComponent(id)}?slim=true`,
          )
          if (!res.ok) return null
          const data = await res.json()
          return data.artist as ArtistData
        } catch {
          return null
        }
      }),
    ).then((rs) => {
      if (cancelled) return
      setArtists(rs.filter(Boolean) as ArtistData[])
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { artists, loaded }
}

// ───────────────────────────────────────────────────────────────────────────
//   Color helpers (chart line color lerp)
// ───────────────────────────────────────────────────────────────────────────

const C_NEUTRAL = { r: 4, g: 223, b: 162 }
const C_POSITIVE = { r: 4, g: 223, b: 162 }
const C_NEGATIVE = { r: 255, g: 75, b: 75 }

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function lerpRGB(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number,
) {
  return `rgb(${Math.round(lerp(from.r, to.r, t))},${Math.round(
    lerp(from.g, to.g, t),
  )},${Math.round(lerp(from.b, to.b, t))})`
}

// ───────────────────────────────────────────────────────────────────────────
//   AboutChart — animated draw-on line chart used in the hero
// ───────────────────────────────────────────────────────────────────────────

function AboutChart({
  data = [],
  height: H = 260,
  onPrice,
  onChangeData,
  onColor,
}: {
  data?: DataPoint[]
  height?: number
  onPrice?: (p: number) => void
  onChangeData?: (d: { percentChange: number; rawChange: number }) => void
  onColor?: (c: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [W, setW] = useState(600)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const onPriceRef = useRef(onPrice)
  const onChangeRef = useRef(onChangeData)
  const onColorRef = useRef(onColor)
  useEffect(() => {
    onPriceRef.current = onPrice
  }, [onPrice])
  useEffect(() => {
    onChangeRef.current = onChangeData
  }, [onChangeData])
  useEffect(() => {
    onColorRef.current = onColor
  }, [onColor])

  useEffect(() => {
    const update = () => {
      if (svgRef.current) {
        const w = svgRef.current.getBoundingClientRect().width
        if (w > 0) setW(w)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (svgRef.current) ro.observe(svgRef.current)
    return () => ro.disconnect()
  }, [])

  const chartData = useMemo(() => {
    const pts = data
      .map((p) => ({
        timestamp: new Date(p.timestamp).getTime(),
        price: parseFloat(String(p.index)),
      }))
      .filter((p) => !isNaN(p.timestamp) && !isNaN(p.price))
      .sort((a, b) => a.timestamp - b.timestamp)
    if (!pts.length) return []
    const last = pts[pts.length - 1]
    if (last.timestamp < Date.now() - 30_000)
      pts.push({ timestamp: Date.now(), price: last.price })
    if (pts.length > 300) {
      const step = (pts.length - 1) / 299
      return Array.from(
        { length: 300 },
        (_, i) => pts[Math.min(Math.round(i * step), pts.length - 1)],
      )
    }
    return pts
  }, [data])

  const firstPrice = chartData[0]?.price ?? 0
  const lastPrice = chartData[chartData.length - 1]?.price ?? 0
  const isPos = lastPrice >= firstPrice
  const targetC = isPos ? C_POSITIVE : C_NEGATIVE
  const minP = chartData.length ? Math.min(...chartData.map((d) => d.price)) : 0
  const maxP = chartData.length ? Math.max(...chartData.map((d) => d.price)) : 1
  const pRange = maxP === minP ? 1 : maxP - minP
  const tStart = chartData[0]?.timestamp ?? 0
  const tEnd = chartData[chartData.length - 1]?.timestamp ?? tStart + 1
  const tRange = tEnd - tStart || 1
  const PAD_T = 20
  const PAD_B = 20

  const points = useMemo(
    () =>
      chartData.map((d) => ({
        x: ((d.timestamp - tStart) / tRange) * W,
        y:
          PAD_T +
          (1 - (d.price - minP) / pRange) * (H - PAD_T - PAD_B),
        price: d.price,
      })),
    [chartData, W, tStart, tRange, minP, pRange, H],
  )

  const linePath = points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
    )
    .join(' ')

  const totalLen = useMemo(
    () =>
      points.reduce((s, p, i) => {
        if (!i) return 0
        const prev = points[i - 1]
        return s + Math.hypot(p.x - prev.x, p.y - prev.y)
      }, 0),
    [points],
  )

  const pointsRef = useRef(points)
  const totalLenRef = useRef(totalLen)
  const chartDataRef = useRef(chartData)
  const targetCRef = useRef(targetC)
  useEffect(() => {
    pointsRef.current = points
  }, [points])
  useEffect(() => {
    totalLenRef.current = totalLen
  }, [totalLen])
  useEffect(() => {
    chartDataRef.current = chartData
  }, [chartData])
  useEffect(() => {
    targetCRef.current = targetC
  }, [targetC])

  const dataKey = `${chartData.length}-${chartData[0]?.price}-${
    chartData[chartData.length - 1]?.price
  }`

  useEffect(() => {
    if (!chartData.length) return
    setProgress(0)
    setDone(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = performance.now()
    const DURATION = 8000
    const animate = (now: number) => {
      const t = Math.min((now - startRef.current) / DURATION, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const colorT = Math.max(0, Math.min(1, (eased - 0.1) / 0.7))
      onColorRef.current?.(lerpRGB(C_NEUTRAL, targetCRef.current, colorT))
      const pts = pointsRef.current
      const tot = totalLenRef.current
      const drawn = tot * eased
      let acc = 0
      let dot = pts[pts.length - 1] ?? { x: 0, y: 0, price: 0 }
      if (pts.length > 1 && tot > 0) {
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1]
          const curr = pts[i]
          const seg = Math.hypot(curr.x - prev.x, curr.y - prev.y)
          if (acc + seg >= drawn) {
            const st = seg > 0 ? (drawn - acc) / seg : 0
            dot = {
              x: prev.x + st * (curr.x - prev.x),
              y: prev.y + st * (curr.y - prev.y),
              price: prev.price + st * (curr.price - prev.price),
            }
            break
          }
          acc += seg
        }
      }
      onPriceRef.current?.(dot.price)
      const cd = chartDataRef.current
      if (cd.length) {
        const fp = cd[0].price
        onChangeRef.current?.({
          rawChange: dot.price - fp,
          percentChange: fp > 0 ? ((dot.price - fp) / fp) * 100 : 0,
        })
      }
      setProgress(eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDone(true)
        onColorRef.current?.(lerpRGB(C_NEUTRAL, targetCRef.current, 1))
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  const colorT = Math.max(0, Math.min(1, (progress - 0.1) / 0.7))
  const color = lerpRGB(C_NEUTRAL, targetC, colorT)
  const last = points[points.length - 1]
  const dashArray = totalLen > 0 ? totalLen : undefined
  const dashOffset = totalLen > 0 ? totalLen * (1 - progress) : undefined

  const currentDrawn = totalLen * progress
  let acc = 0
  let dotPos = last ?? { x: 0, y: 0, price: 0 }
  if (!done && points.length > 1 && totalLen > 0) {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const seg = Math.hypot(curr.x - prev.x, curr.y - prev.y)
      if (acc + seg >= currentDrawn) {
        const t = seg > 0 ? (currentDrawn - acc) / seg : 0
        dotPos = {
          x: prev.x + t * (curr.x - prev.x),
          y: prev.y + t * (curr.y - prev.y),
          price: prev.price + t * (curr.price - prev.price),
        }
        break
      }
      acc += seg
    }
  }

  return (
    <div
      style={{ width: '100%', height: H, position: 'relative' }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
          />
        )}
        {last && done ? (
          <>
            <circle
              cx={last.x}
              cy={last.y}
              r="3.5"
              fill={color}
              style={{
                animation: 'sxDotPulse 0.9s ease-out infinite',
                transformOrigin: 'center',
                transformBox: 'fill-box',
              }}
            />
            <circle cx={last.x} cy={last.y} r="3.5" fill={color} />
          </>
        ) : (
          <circle cx={dotPos.x} cy={dotPos.y} r="3.5" fill={color} />
        )}
      </svg>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   FoundationsGraphic — 4 streaming logos converging on one node
// ───────────────────────────────────────────────────────────────────────────

const SPOTIFY_PATH =
  'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z'

const APPLE_PATH =
  'M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 0 0-1.877-.726 10.496 10.496 0 0 0-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408a10.61 10.61 0 0 0-.1 1.18c0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 0 0 1.57-.1c.822-.106 1.596-.35 2.296-.81a5.046 5.046 0 0 0 1.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 0 1 1.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 0 0 .02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 0 0-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066l-5.597 1.09c-.306.06-.43.197-.437.516v7.37c0 .38-.05.753-.203 1.103-.28.64-.77 1.04-1.434 1.233-.365.106-.742.16-1.123.18-.96.05-1.79-.593-1.96-1.53a1.88 1.88 0 0 1 1.048-2.025c.355-.177.735-.267 1.117-.344.27-.055.54-.102.808-.16.39-.084.594-.292.615-.696.004-.08 0-.16 0-.24V5.992c0-.564.15-.915.57-1.04 1.914-.568 3.83-1.132 5.744-1.697.582-.172 1.164-.345 1.746-.516.47-.14.69-.01.69.478v5.896z'

const TIDAL_PATH =
  'M18.81 4.16v3.03h5.16V4.16h-5.16zm0 4.54v3.03h5.16V8.7h-5.16zm0 4.54v3.03h5.16v-3.03h-5.16zM12.63 4.16v3.03h5.16V4.16h-5.16zm0 4.54v3.03h5.16V8.7h-5.16zm0 4.54v3.03h5.16v-3.03h-5.16zm0 4.54v3.03h5.16v-3.03h-5.16zM6.45 8.7v3.03h5.16V8.7H6.45zm0 4.54v3.03h5.16v-3.03H6.45zm0 4.54v3.03h5.16v-3.03H6.45zM.27 13.24v3.03h5.16v-3.03H.27zm0 4.54v3.03h5.16v-3.03H.27z'

const YOUTUBE_PATH =
  'M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z'

function FoundationsGraphic() {
  const logos = [SPOTIFY_PATH, APPLE_PATH, TIDAL_PATH, YOUTUBE_PATH]
  const xs = [48, 203, 357, 512]
  return (
    <div style={{ width: 560 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: 64,
        }}
      >
        {logos.map((d, i) => (
          <div
            key={i}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: BORDER,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={i === 0 ? 36 : 32}
              height={i === 0 ? 36 : 32}
              fill="white"
            >
              <path d={d} />
            </svg>
          </div>
        ))}
      </div>
      <svg
        width="560"
        height="258"
        viewBox="0 0 560 258"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {xs.map((x, i) => (
            <path
              key={i}
              id={`fnp${i}`}
              d={`M ${x} 0 L ${x} 140 L 280 200 L 280 258`}
            />
          ))}
        </defs>

        {xs.map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="140"
            stroke={BORDER}
            strokeWidth="2"
          />
        ))}
        {xs.map((x, i) => (
          <line
            key={`vp${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="140"
            stroke="white"
            strokeWidth="2"
            opacity="0"
          >
            <animate
              attributeName="opacity"
              values="0;0.2;0"
              dur="3s"
              repeatCount="indefinite"
              begin={`${i * 0.75}s`}
            />
          </line>
        ))}

        {xs.map((x) => (
          <line
            key={`d${x}`}
            x1={x}
            y1="140"
            x2="280"
            y2="200"
            stroke={BORDER}
            strokeWidth="2"
          />
        ))}
        {xs.map((x, i) => (
          <line
            key={`dp${x}`}
            x1={x}
            y1="140"
            x2="280"
            y2="200"
            stroke="white"
            strokeWidth="2"
            opacity="0"
          >
            <animate
              attributeName="opacity"
              values="0;0.2;0"
              dur="3s"
              repeatCount="indefinite"
              begin={`${i * 0.75}s`}
            />
          </line>
        ))}

        <line
          x1="280"
          y1="200"
          x2="280"
          y2="258"
          stroke={BORDER}
          strokeWidth="2"
        />
        <line
          x1="280"
          y1="200"
          x2="280"
          y2="258"
          stroke="white"
          strokeWidth="2"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            values="0;0.2;0"
            dur="3s"
            repeatCount="indefinite"
          />
        </line>

        {xs.map((_, i) =>
          [0, 2].map((extra) => (
            <circle
              key={`c${i}-${extra}`}
              r="2.5"
              fill="white"
              opacity="0"
            >
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                begin={`${i * 0.5 + extra}s`}
              >
                <mpath href={`#fnp${i}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                values="0.3;0.9;0.9;0.3"
                dur="4s"
                repeatCount="indefinite"
                begin={`${i * 0.5 + extra}s`}
              />
              <animate
                attributeName="r"
                values="2;2.5;2.5;2"
                dur="4s"
                repeatCount="indefinite"
                begin={`${i * 0.5 + extra}s`}
              />
            </circle>
          )),
        )}
      </svg>
      <TopArtistsList />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   TopArtistsList — fetches from /api/discover; silent if unavailable
// ───────────────────────────────────────────────────────────────────────────

interface TopArtist {
  id: string
  name: string
  index_price: number | null
  change_1m: number | null
  image_url?: string | null
}

function TopArtistsList() {
  const [artists, setArtists] = useState<TopArtist[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    fetch('/api/discover?limit=10&offset=0&sort_by=index_price&sort_dir=desc')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setArtists(d?.artists ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!artists.length) return
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % artists.length)
    }, 3000)
    return () => clearInterval(t)
  }, [artists.length])

  if (!artists.length) return null
  const a = artists[idx]
  const change = a.change_1m

  return (
    <div style={{ width: '100%', padding: '0 56px', marginTop: 0 }}>
      <div
        key={`${a.id}-${idx}`}
        style={{
          animation:
            'sxArtistFadeIn 0.4s cubic-bezier(0.25,0.46,0.45,0.94) both',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            border: `2px solid ${BORDER}`,
            borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          {a.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.image_url}
              alt={a.name}
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: '#3f3f46',
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: WHITE,
                fontFamily: FONT,
                fontSize: 14,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {a.name}
            </div>
            <div
              style={{ color: SEC, fontFamily: FONT, fontSize: 12, marginTop: 2 }}
            >
              Index
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 6,
              flexShrink: 0,
            }}
          >
            <span style={{ color: SEC, fontFamily: FONT, fontSize: 12 }}>
              {a.index_price != null
                ? a.index_price.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : '—'}
              <span
                style={{ fontSize: 10, marginLeft: 4, fontWeight: 400 }}
              >
                USD
              </span>
            </span>
            {change != null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 18"
                  fill="none"
                  style={{
                    color: change >= 0 ? POSITIVE : NEGATIVE,
                    transform: `rotate(${change >= 0 ? 0 : 180}deg) translateY(1px)`,
                  }}
                >
                  <path fill="currentColor" d="m12 0 10.392 14.25H1.608z" />
                </svg>
                <span
                  style={{
                    color: change >= 0 ? POSITIVE : NEGATIVE,
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {Math.abs(change).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </span>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   StreamingMetricsScroller — perspective-3D row carousel
// ───────────────────────────────────────────────────────────────────────────

const METRIC_ROWS = [
  { source: 'SPOTIFY', label: 'Monthly Listeners', signal: 'HIGH', trend: '+12.4%', note: 'Primary index weight' },
  { source: 'APPLE MUSIC', label: 'Chart Position', signal: 'MED', trend: '+6.1%', note: 'Regional chart data' },
  { source: 'YOUTUBE', label: 'Stream Volume', signal: 'HIGH', trend: '+31.2%', note: '90-day rolling avg' },
  { source: 'SHAZAM', label: 'Discovery Rate', signal: 'MED', trend: '+8.7%', note: 'New listener signal' },
  { source: 'SOUNDCLOUD', label: 'Reposts', signal: 'LOW', trend: '+3.2%', note: 'Underground reach' },
  { source: 'DEEZER', label: 'Active Streams', signal: 'MED', trend: '+9.0%', note: 'EU market data' },
  { source: 'AMAZON MUSIC', label: 'Prime Plays', signal: 'MED', trend: '+7.5%', note: 'Paid listener base' },
  { source: 'PANDORA', label: 'Station Adds', signal: 'LOW', trend: '+2.1%', note: 'US radio proxy' },
  { source: 'GENIUS', label: 'Annotation Views', signal: 'MED', trend: '+15.3%', note: 'Fan engagement' },
]
const ROW_H = 72
const ROW_GAP = 28
const STRIDE = ROW_H + ROW_GAP
const TOTAL_SCROLL_H = METRIC_ROWS.length * STRIDE
const VISIBLE = 5
const CONTAINER_H = VISIBLE * STRIDE - ROW_GAP

function StreamingMetricsScroller() {
  const innerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const offsetRef = useRef(0)

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const rows = Array.from(inner.querySelectorAll<HTMLElement>('[data-row]'))
    const cy = CONTAINER_H / 2
    const animate = () => {
      offsetRef.current = (offsetRef.current + 0.35) % TOTAL_SCROLL_H
      const off = offsetRef.current
      rows.forEach((el, i) => {
        let y = i * STRIDE - off
        y = ((y % TOTAL_SCROLL_H) + TOTAL_SCROLL_H) % TOTAL_SCROLL_H
        if (y > TOTAL_SCROLL_H / 2) y -= TOTAL_SCROLL_H
        const center = y + ROW_H / 2
        const dist = Math.abs(center)
        const t = Math.min(dist / (CONTAINER_H / 2), 1)
        const angle = t * 55 * -Math.sign(center)
        const scaleX = Math.max(0.4, Math.cos((t * 55 * Math.PI) / 180))
        el.style.transform = `translateY(${y + cy - ROW_H / 2}px) rotateX(${angle}deg) scaleX(${scaleX})`
        el.style.opacity = String(Math.max(0, 1 - t * 1.1))
      })
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      style={{
        width: 560,
        height: CONTAINER_H,
        perspective: 900,
        perspectiveOrigin: '50% 50%',
        overflow: 'hidden',
        position: 'relative',
        maskImage:
          'linear-gradient(to bottom,transparent 0%,black 30%,black 70%,transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom,transparent 0%,black 30%,black 70%,transparent 100%)',
      }}
    >
      <div
        ref={innerRef}
        style={{
          position: 'relative',
          height: '100%',
          transformStyle: 'preserve-3d',
        }}
      >
        {METRIC_ROWS.map((item) => (
          <div
            key={item.source}
            data-row
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: ROW_H,
              opacity: 0,
              transformOrigin: '50% 50%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                height: '100%',
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                backgroundColor: 'rgba(255,255,255,0.02)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: SEC,
                    fontFamily: FONT,
                    minWidth: 96,
                  }}
                >
                  {item.source}
                </span>
                <span
                  style={{ fontSize: 14, color: WHITE, fontFamily: FONT }}
                >
                  {item.label}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                }}
              >
                <span style={{ fontSize: 12, color: SEC, fontFamily: FONT }}>
                  {item.note}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: item.trend.startsWith('+') ? POSITIVE : NEGATIVE,
                    fontFamily: FONT,
                    minWidth: 52,
                    textAlign: 'right',
                  }}
                >
                  {item.trend}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: `1px solid ${BORDER}`,
                    fontFamily: FONT,
                    color: item.signal === 'HIGH' ? WHITE : SEC,
                    backgroundColor:
                      item.signal === 'HIGH'
                        ? 'rgba(255,255,255,0.08)'
                        : 'transparent',
                    minWidth: 40,
                    textAlign: 'center',
                  }}
                >
                  {item.signal}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   CultureNetworkGraphic — 8-spoke network with travelling dots
// ───────────────────────────────────────────────────────────────────────────

function CultureNetworkGraphic() {
  const nodes: [number, number][] = [
    [102, 102],
    [398, 102],
    [102, 398],
    [398, 398],
    [250, 40],
    [460, 250],
    [250, 460],
    [40, 250],
  ]
  return (
    <svg width="500" height="500" viewBox="0 0 500 500" style={{ overflow: 'visible' }}>
      <defs>
        {nodes.map(([x, y], i) => (
          <path key={i} id={`cn${i}`} d={`M ${x} ${y} L 250 250`} />
        ))}
      </defs>

      {nodes.map(([x, y], i) => (
        <line
          key={`l${i}`}
          x1={x}
          y1={y}
          x2="250"
          y2="250"
          stroke={BORDER}
          strokeWidth="2"
        />
      ))}
      {nodes.map(([x, y], i) => (
        <line
          key={`lp${i}`}
          x1={x}
          y1={y}
          x2="250"
          y2="250"
          stroke="white"
          strokeWidth="2"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            values="0;0.2;0"
            dur="3s"
            repeatCount="indefinite"
            begin={`${i * 0.375}s`}
          />
        </line>
      ))}

      {nodes.map(([x, y], i) => (
        <circle key={`n${i}`} cx={x} cy={y} r="22" fill={BORDER} opacity="0.8" />
      ))}

      <circle cx="250" cy="250" r="24" fill="white" opacity="0.9" />

      {nodes.map((_, i) => (
        <circle key={`d${i}`} r="3" fill="white" opacity="0">
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            begin={`${i * 0.375}s`}
          >
            <mpath href={`#cn${i}`} />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0.3;0.9;0"
            dur="3s"
            repeatCount="indefinite"
            begin={`${i * 0.375}s`}
          />
        </circle>
      ))}
    </svg>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   RadarGraphic — animated 6-axis radar polygon
// ───────────────────────────────────────────────────────────────────────────

const RCX = 230
const RCY = 230
const R_MAX = 170
const R_AXES = ['STREAMING', 'POSITIONING', 'CONVICTION', 'MOMENTUM', 'VOLUME', 'SIGNAL']
const R_ANGLES = Array.from({ length: 6 }, (_, i) => -Math.PI / 2 + i * (Math.PI / 3))
const RV1 = [0.82, 0.88, 0.72, 0.85, 0.65, 0.9]
const RV2 = [0.75, 0.92, 0.8, 0.78, 0.88, 0.7]
const RVD = [0.4, 0.5, 0.45, 0.55, 0.35, 0.48]
const SP = '0.45 0 0.55 1;0.45 0 0.55 1'

function rPoly(vals: number[]) {
  return vals
    .map((v, i) =>
      `${(RCX + v * R_MAX * Math.cos(R_ANGLES[i])).toFixed(1)},${(
        RCY +
        v * R_MAX * Math.sin(R_ANGLES[i])
      ).toFixed(1)}`,
    )
    .join(' ')
}
const RP_DIM = rPoly(RVD)
const RP1 = rPoly(RV1)
const RP2 = rPoly(RV2)
const RVerts1 = RV1.map((v, i) => ({
  x: RCX + v * R_MAX * Math.cos(R_ANGLES[i]),
  y: RCY + v * R_MAX * Math.sin(R_ANGLES[i]),
}))
const RVerts2 = RV2.map((v, i) => ({
  x: RCX + v * R_MAX * Math.cos(R_ANGLES[i]),
  y: RCY + v * R_MAX * Math.sin(R_ANGLES[i]),
}))

function RadarGraphic() {
  return (
    <svg width="460" height="460" viewBox="0 0 460 460" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id="rgGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.10" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {[0.33, 0.66].map((s) => (
        <polygon
          key={s}
          fill="none"
          stroke={BORDER}
          strokeWidth="1.4"
          opacity="0.3"
        >
          <animate
            attributeName="points"
            values={`${rPoly(RV1.map((v) => v * s))};${rPoly(RV2.map((v) => v * s))};${rPoly(RV1.map((v) => v * s))}`}
            dur="7s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;0.5;1"
            keySplines={SP}
          />
        </polygon>
      ))}

      {RVerts1.map((v1, i) => {
        const v2 = RVerts2[i]
        return (
          <line
            key={`ax${i}`}
            x1={RCX}
            y1={RCY}
            strokeWidth="1.4"
            stroke={BORDER}
            opacity="0.5"
          >
            <animate
              attributeName="x2"
              values={`${v1.x.toFixed(1)};${v2.x.toFixed(1)};${v1.x.toFixed(1)}`}
              dur="7s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.5;1"
              keySplines={SP}
            />
            <animate
              attributeName="y2"
              values={`${v1.y.toFixed(1)};${v2.y.toFixed(1)};${v1.y.toFixed(1)}`}
              dur="7s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.5;1"
              keySplines={SP}
            />
          </line>
        )
      })}

      <polygon
        points={RP_DIM}
        fill="rgba(255,255,255,0.025)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />

      <polygon
        fill="rgba(255,255,255,0.05)"
        stroke={BORDER}
        strokeWidth="1.4"
        strokeLinejoin="round"
      >
        <animate
          attributeName="points"
          values={`${RP1};${RP2};${RP1}`}
          dur="7s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0;0.5;1"
          keySplines={SP}
        />
        <animate
          attributeName="opacity"
          values="0.82;1;0.82"
          dur="7s"
          repeatCount="indefinite"
        />
      </polygon>

      <circle cx={RCX} cy={RCY} r={70} fill="url(#rgGlow)" />

      {RVerts1.map((v1, i) => {
        const v2 = RVerts2[i]
        return (
          <circle key={`v${i}`} r="2.5" fill="white" opacity="0.75">
            <animate
              attributeName="cx"
              values={`${v1.x.toFixed(1)};${v2.x.toFixed(1)};${v1.x.toFixed(1)}`}
              dur="7s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.5;1"
              keySplines={SP}
            />
            <animate
              attributeName="cy"
              values={`${v1.y.toFixed(1)};${v2.y.toFixed(1)};${v1.y.toFixed(1)}`}
              dur="7s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.5;1"
              keySplines={SP}
            />
            <animate
              attributeName="opacity"
              values="0.65;0.95;0.65"
              dur="7s"
              repeatCount="indefinite"
            />
          </circle>
        )
      })}

      <circle cx={RCX} cy={RCY} r="3.5" fill="white">
        <animate
          attributeName="r"
          values="2.5;4;2.5"
          dur="3s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.65;1;0.65"
          dur="3s"
          repeatCount="indefinite"
        />
      </circle>

      {R_AXES.map((label, i) => {
        const cos = Math.cos(R_ANGLES[i])
        return (
          <text
            key={label}
            x={(RCX + (R_MAX + 22) * cos).toFixed(1)}
            y={(RCY + (R_MAX + 22) * Math.sin(R_ANGLES[i])).toFixed(1)}
            textAnchor={
              Math.abs(cos) < 0.15 ? 'middle' : cos > 0 ? 'start' : 'end'
            }
            dominantBaseline="middle"
            fontSize="8"
            fontFamily={FONT}
            fill="white"
            opacity="0.45"
            letterSpacing="0.06em"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   WaitlistModal — kept for the CTA, fully functional UI (API calls 404 in
//   illyreels; the Email step's error text will surface if the endpoints
//   aren't wired up).
// ───────────────────────────────────────────────────────────────────────────

type WaitlistStep = 'email' | 'otp' | 'success'

function WaitlistModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<WaitlistStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  useEffect(() => {
    if (step === 'otp') setTimeout(() => otpRefs.current[0]?.focus(), 50)
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }
      setResendCooldown(60)
      setStep('otp')
    } catch {
      setError('Failed to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const submitOtp = async (code: string) => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/waitlist/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Invalid code')
        setLoading(false)
        return
      }
      setStep('success')
    } catch {
      setError('Failed to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[i] = d
    setOtp(next)
    if (d && i < 5) otpRefs.current[i + 1]?.focus()
    if (next.every((c) => c !== '')) submitOtp(next.join(''))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          borderRadius: 12,
          padding: 32,
          backgroundColor: BG,
          border: `1px solid ${BORDER}`,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            right: 20,
            top: 20,
            color: '#52525b',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {step === 'email' && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 300,
                  color: WHITE,
                  fontFamily: FONT,
                  lineHeight: 1.2,
                }}
              >
                Join the waitlist
              </h2>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  color: SEC,
                  fontFamily: FONT,
                }}
              >
                Be first to know when Sonotrade launches.
              </p>
            </div>
            <form
              onSubmit={handleJoin}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                autoComplete="email"
                required
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 9999,
                  border: '1px solid transparent',
                  padding: '0 20px',
                  fontSize: 14,
                  color: WHITE,
                  backgroundColor: SURFACE,
                  fontFamily: FONT,
                  outline: 'none',
                }}
              />
              {error && (
                <p
                  style={{
                    margin: 0,
                    borderRadius: 9999,
                    border: `1px solid ${BORDER_STRONG}`,
                    backgroundColor: SURFACE,
                    padding: '12px 20px',
                    fontSize: 14,
                    color: NEGATIVE,
                    fontFamily: FONT,
                  }}
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 9999,
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                  backgroundColor: WHITE,
                  color: BG,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: FONT,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? 'Sending…' : 'Get early access'}
              </button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: WHITE,
                fontFamily: FONT,
              }}
            >
              Enter code
            </h2>
            <p
              style={{
                margin: '8px 0 32px',
                fontSize: 14,
                color: SEC,
                fontFamily: FONT,
              }}
            >
              We sent a 6-digit code to{' '}
              <span style={{ color: WHITE, fontWeight: 500 }}>{email}</span>
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'space-between',
                marginBottom: 24,
              }}
            >
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  disabled={loading}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    textAlign: 'center',
                    fontSize: 20,
                    fontWeight: 600,
                    color: WHITE,
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    outline: 'none',
                    fontFamily: MONO,
                  }}
                />
              ))}
            </div>
            {error && (
              <div
                style={{
                  marginBottom: 16,
                  borderRadius: 8,
                  border: `1px solid ${BORDER_STRONG}`,
                  backgroundColor: SURFACE,
                  padding: '12px 16px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: NEGATIVE,
                    fontFamily: FONT,
                  }}
                >
                  {error}
                </p>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setError('')
                  setOtp(['', '', '', '', '', ''])
                }}
                style={{
                  fontSize: 14,
                  color: MUTED,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                ← Back
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 20,
              padding: '16px 0',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(4,223,157,0.1)',
                border: '1px solid rgba(4,223,157,0.3)',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={POSITIVE}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 300,
                  color: WHITE,
                  fontFamily: FONT,
                }}
              >
                You&apos;re on the list
              </h2>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  color: SEC,
                  fontFamily: FONT,
                }}
              >
                We&apos;ll reach out to <span style={{ color: WHITE }}>{email}</span>{' '}
                when it&apos;s your turn.
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                height: 44,
                borderRadius: 9999,
                padding: '0 32px',
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: WHITE,
                color: BG,
                border: 'none',
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   Small reusable bits
// ───────────────────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        color: SEC,
        fontFamily: FONT,
      }}
    >
      {text}
    </span>
  )
}

function TextBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3
        style={{
          margin: '0 0 16px',
          padding: 0,
          fontSize: 18,
          fontWeight: 400,
          color: WHITE,
          fontFamily: FONT,
          letterSpacing: '-0.025em',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: SEC,
          fontFamily: FONT,
          lineHeight: 1.65,
        }}
      >
        {body}
      </p>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   Page
// ───────────────────────────────────────────────────────────────────────────

export default function SonotradeLanding() {
  const { artists: heroArtists, loaded: heroLoaded } = useHeroArtists()
  const [displayIndex, setDisplayIndex] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const [drawingPrice, setDrawingPrice] = useState<number | null>(null)
  const [changeData, setChangeData] = useState<{
    percentChange: number
    rawChange: number
  } | null>(null)
  const [chartColor, setChartColor] = useState(POSITIVE)
  const [showWaitlist, setShowWaitlist] = useState(false)

  useEffect(() => {
    if (!heroLoaded || heroArtists.length === 0) return
    const t = setInterval(() => {
      setOpacity(0)
      setTimeout(() => {
        setDisplayIndex((i) => (i + 1) % heroArtists.length)
        setDrawingPrice(null)
        setChangeData(null)
        setChartColor(POSITIVE)
        requestAnimationFrame(() => setOpacity(1))
      }, 650)
    }, HERO_INTERVAL_MS)
    return () => clearInterval(t)
  }, [heroLoaded, heroArtists.length])

  const artist = heroArtists[displayIndex] ?? null
  const chartData = artist?.data_points ?? []

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: BG,
        color: WHITE,
        fontFamily: FONT,
      }}
    >
      <style>{`
        @keyframes sxDotPulse {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        @keyframes sxArtistFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .stl-btn { transition: opacity 75ms, transform 75ms; cursor: pointer; }
        .stl-btn:hover { opacity: 0.8; }
        .stl-btn:active { transform: scale(0.92); }
      `}</style>

      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          height: 68.555,
          borderBottom: `1px solid ${BORDER}`,
          backgroundColor: BG,
          display: 'flex',
          alignItems: 'center',
          transform: 'translateZ(0)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: MAX_W,
            margin: '0 auto',
            padding: '0 24px',
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontWeight: 400,
              letterSpacing: '-0.05em',
              color: WHITE,
              fontFamily: FONT,
            }}
          >
            Sonotrade
          </span>
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          borderBottom: `1px solid ${BORDER}`,
          backgroundColor: BG,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: MAX_W,
            margin: '0 auto',
            padding: '80px 24px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 64,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 320, maxWidth: 560 }}>
              <h1
                style={{
                  margin: '0 0 24px',
                  padding: 0,
                  fontSize: 56,
                  fontWeight: 300,
                  lineHeight: 1.1,
                  color: WHITE,
                  fontFamily: FONT,
                  letterSpacing: '-0.02em',
                }}
              >
                The first regulated music derivatives
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  lineHeight: 1.65,
                  color: SEC,
                  fontFamily: FONT,
                }}
              >
                Connecting retail traders, record labels, and institutional
                participants through a single, data-driven exchange.
              </p>
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 320,
                opacity: heroLoaded && artist ? opacity : 0,
                transition: 'opacity 0.6s ease',
                minHeight: 380,
                visibility: heroLoaded && artist ? 'visible' : 'hidden',
              }}
            >
              {artist && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {artist.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={artist.image_url}
                          alt={artist.name}
                          style={{
                            width: 64,
                            height: 64,
                            flexShrink: 0,
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                          draggable={false}
                        />
                      ) : (
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            flexShrink: 0,
                            borderRadius: '50%',
                            backgroundColor: BORDER,
                          }}
                        />
                      )}
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 28,
                          fontWeight: 300,
                          color: WHITE,
                          fontFamily: FONT,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {artist.name}
                      </h2>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 40,
                          fontWeight: 600,
                          color: WHITE,
                          fontFamily: FONT,
                          letterSpacing: '-0.02em',
                          transition: 'color 0.6s ease',
                        }}
                      >
                        ${(drawingPrice ?? artist.index_price ?? 0).toLocaleString(
                          'en-US',
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 24,
                          fontWeight: 300,
                          color: WHITE,
                          fontFamily: FONT,
                        }}
                      >
                        points
                      </span>
                      {changeData && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginLeft: 8,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 18"
                              fill="none"
                              style={{
                                color: chartColor,
                                transform: `rotate(${changeData.percentChange >= 0 ? '0deg' : '180deg'}) translateY(1px)`,
                              }}
                            >
                              <path fill="currentColor" d="m12 0 10.392 14.25H1.608z" />
                            </svg>
                            <span style={{ color: chartColor, fontSize: 16, fontFamily: FONT }}>
                              {Math.abs(changeData.percentChange).toFixed(2)}%
                            </span>
                          </div>
                          <span style={{ color: chartColor, fontSize: 16, fontFamily: FONT }}>
                            {changeData.rawChange >= 0 ? '+$' : '-$'}
                            {Math.abs(changeData.rawChange).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <AboutChart
                    data={chartData}
                    height={260}
                    onPrice={setDrawingPrice}
                    onChangeData={setChangeData}
                    onColor={setChartColor}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* What is Sonotrade */}
      <Section borderBottom>
        <div style={{ display: 'flex', gap: 80, flexWrap: 'wrap' }}>
          <div style={{ width: 560, flexShrink: 0 }}>
            <FoundationsGraphic />
          </div>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ marginBottom: 48 }}>
              <SectionLabel text="WHAT IS SONOTRADE" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <TextBlock
                title="Our Mission"
                body="Sonotrade is building the first regulated exchange for the music industry. The platform aggregates streaming and performance data to construct live indexes for individual artists, enabling participants to take long or short positions on how an artist performs over time. It serves both retail traders seeking direct market exposure and industry participants who need instruments to hedge financial risk across signings and catalogue acquisitions."
              />
              <TextBlock
                title="The Indexes"
                body="Each artist listed on Sonotrade is assigned a live index that recalculates continuously from streaming volume, chart positioning, and broader performance data. Every contract traded on the platform is priced against this index, ensuring that market prices remain anchored to verifiable, real-world output rather than sentiment alone."
              />
              <TextBlock
                title="The Vision"
                body="The music industry generates substantial economic activity, yet structured financial instruments for it have never existed at scale. Labels absorb significant balance sheet risk through advances and royalty commitments, while retail participants have had no route into the asset class. Sonotrade closes both gaps, providing the exchange infrastructure needed to price, trade, and hedge music-related risk for the first time."
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Why streaming metrics matter */}
      <Section borderBottom>
        <div style={{ marginBottom: 48 }}>
          <SectionLabel text="WHY STREAMING METRICS MATTER" />
        </div>
        <div style={{ display: 'flex', gap: 112, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <TextBlock
                title="Streams drive commercial value"
                body="In the modern music economy, commercial value tracks listenership with near-perfect correlation. Streams determine chart positions, chart positions unlock sync licensing deals, festival slots, and brand partnerships. All of that flows back into catalogue valuations and advance negotiations."
              />
              <TextBlock
                title="The missing market"
                body="Until now there has been no structured way to act on that signal. A label can observe that an artist is growing, but has no instrument to hedge the risk of that growth reversing after a multi-million-dollar advance. A retail participant can sense cultural momentum, but has no market to express that view."
              />
              <TextBlock
                title="The Sonotrade solution"
                body="Sonotrade converts observable streaming data into tradeable indexes, making the relationship between audience and economic value legible, liquid, and actionable for the first time."
              />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <StreamingMetricsScroller />
          </div>
        </div>
      </Section>

      {/* Who is Sonotrade for */}
      <Section>
        <div style={{ display: 'flex', gap: 112, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 560,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CultureNetworkGraphic />
          </div>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ marginBottom: 48 }}>
              <SectionLabel text="WHO IS SONOTRADE FOR" />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 48,
              }}
            >
              <NumberedItem
                num="01"
                body="Retail participants seeking direct financial exposure to the music industry. Establish long or short positions on individual artists, with pricing grounded in live performance data rather than sentiment."
              />
              <NumberedItem
                num="02"
                body="Record labels and industry institutions that carry financial exposure across artist signings, advance structures, and royalty portfolios, and require instruments to actively manage and hedge that risk."
              />
              <NumberedItem
                num="03"
                body="Any participant who recognises that cultural output carries measurable economic value and wants a structured way to act on it. Sonotrade provides the exchange infrastructure to do so with precision and transparency, in a market that has not existed until now."
                fullWidth
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Data & Research */}
      <Section borderTop borderBottom>
        <div style={{ display: 'flex', gap: 80, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ marginBottom: 48 }}>
              <SectionLabel text="DATA & RESEARCH" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <TextBlock
                title="A market that generates data at scale"
                body="Every trade placed on Sonotrade produces a data point. Across thousands of participants and thousands of artists, that adds up to a dense, continuously updated picture of where capital and conviction are moving in real time. No other source generates this kind of structured, financially-grounded dataset in the music industry."
              />
              <TextBlock
                title="Beyond engagement metrics"
                body="The positioning data generated on Sonotrade carries an informational depth that goes well beyond surface-level popularity metrics. When participants put capital behind an artist, they are expressing a conviction backed by real risk. That signal, who is actually taking positions early and how large, is a fundamentally different kind of data to engagement or follower counts."
              />
              <TextBlock
                title="Market behaviour as intelligence"
                body="Trading activity on a live market generates a continuous stream of behavioural signals. When participants with strong historical accuracy begin moving around the same artist, that pattern carries information the kind that does not surface through traditional scouting channels. This is one example of how market data can function as an early intelligence layer for the industry."
              />
              <TextBlock
                title="Top traders as a signal source"
                body="In any market, a subset of participants consistently positions ahead of broader moves. Their track record is observable in the data. When that subset begins concentrating around the same artist, it is not a single opinion or a trend report. It is financially-backed conviction from people who have repeatedly demonstrated patterns that predict hits. That kind of signal is hard to ignore."
              />
            </div>
          </div>
          <div
            style={{
              width: 460,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RadarGraphic />
          </div>
        </div>
      </Section>

      {/* A&R Team */}
      <Section borderBottom>
        <div style={{ marginBottom: 48 }}>
          <SectionLabel text="A&R TEAM" />
        </div>
        <div style={{ marginBottom: 48, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 36,
              fontWeight: 300,
              lineHeight: 1.2,
              color: WHITE,
              fontFamily: FONT,
              letterSpacing: '-0.02em',
            }}
          >
            An A&amp;R engine built on market behaviour, not traditional scouting
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: SEC,
              fontFamily: FONT,
              lineHeight: 1.65,
            }}
          >
            Sonotrade operates a dedicated A&amp;R team that works directly from the
            signals generated by the platform. Rather than relying on traditional
            scouting alone, the team uses positioning data as a primary input,
            identifying where conviction is clustering, cross-referencing that against
            streaming trajectory and index momentum, and converting the strongest
            signals into active deal flow. This is A&amp;R built on the same
            analytical foundation as the exchange itself.
          </p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {[
            'Trading activity is monitored for clustering patterns, moments where positioning across multiple participants begins to converge around the same artist within a short window.',
            'Candidate signals are evaluated against broader market context, index trajectory, volume behaviour, and historical patterns, to distinguish genuine early conviction from noise.',
            'Signals that clear the threshold feed into an active pipeline. From there, the work shifts from data to relationships, converting market intelligence into active dealflow.',
          ].map((body, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                padding: 24,
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                backgroundColor: 'rgba(255,255,255,0.02)',
              }}
            >
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 300,
                  color: WHITE,
                  fontFamily: FONT,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                0{i + 1}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: SEC,
                  fontFamily: FONT,
                  lineHeight: 1.65,
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Enterprise API teaser */}
      <Section borderBottom>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
            padding: 48,
            borderRadius: 16,
            border: `1px solid ${BORDER}`,
            backgroundColor: 'rgba(255,255,255,0.02)',
            overflow: 'hidden',
          }}
        >
          {/* CSS grid background */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px), linear-gradient(90deg, ${BORDER} 1px, transparent 1px)`,
              backgroundSize: '48px 48px',
              opacity: 0.3,
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel text="ENTERPRISE API" />
              <span
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  padding: '2px 8px',
                  borderRadius: 4,
                  color: SEC,
                  border: `1px solid ${BORDER}`,
                  fontFamily: FONT,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
              >
                Coming soon
              </span>
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 300,
                lineHeight: 1.3,
                color: WHITE,
                fontFamily: FONT,
                letterSpacing: '-0.02em',
              }}
            >
              Programmatic access to Sonotrade&apos;s market data
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: SEC,
                fontFamily: FONT,
                lineHeight: 1.65,
              }}
            >
              Direct API access to live artist indexes, historical positioning data,
              leaderboard flows, and aggregated conviction signals. Built for industry
              participants, research teams, and data-driven operators.
            </p>
          </div>
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {[
              { endpoint: 'GET /v1/indexes/:artist', desc: 'Live artist index price' },
              { endpoint: 'GET /v1/leaderboard/flows', desc: 'Top trader positioning data' },
              { endpoint: 'GET /v1/signals/conviction', desc: 'Aggregated conviction signal' },
              { endpoint: 'GET /v1/artists/:id/history', desc: 'Historical index & volume' },
            ].map((row) => (
              <div
                key={row.endpoint}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  backgroundColor: 'rgba(10,10,10,0.8)',
                }}
              >
                <code
                  style={{
                    fontSize: 12,
                    color: WHITE,
                    fontFamily: MONO,
                    opacity: 0.85,
                  }}
                >
                  {row.endpoint}
                </code>
                <span
                  style={{
                    fontSize: 10,
                    color: SEC,
                    fontFamily: FONT,
                    flexShrink: 0,
                  }}
                >
                  {row.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <section
        style={{
          borderTop: `1px solid ${BORDER}`,
          backgroundColor: BG,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Dot-grid stand-in for the monogram background */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: MAX_W,
            margin: '0 auto',
            padding: '128px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 24,
          }}
        >
          <h2
            style={{
              margin: 0,
              padding: 0,
              fontSize: 56,
              fontWeight: 300,
              lineHeight: 1.1,
              color: WHITE,
              fontFamily: FONT,
              letterSpacing: '-0.02em',
              maxWidth: 720,
            }}
          >
            The Market Infrastructure for Music. Coming Soon.
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              color: SEC,
              fontFamily: FONT,
              lineHeight: 1.65,
            }}
          >
            Real data. Real positions. The first exchange for music derivatives.
          </p>
          <button
            onClick={() => setShowWaitlist(true)}
            className="stl-btn"
            style={{
              marginTop: 16,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 9999,
              padding: '12px 32px',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.05em',
              backgroundColor: WHITE,
              color: BG,
              border: 'none',
              fontFamily: FONT,
            }}
          >
            Join Waitlist
          </button>
        </div>
      </section>

      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   Small layout helpers
// ───────────────────────────────────────────────────────────────────────────

function Section({
  children,
  borderTop,
  borderBottom,
}: {
  children: React.ReactNode
  borderTop?: boolean
  borderBottom?: boolean
}) {
  return (
    <section
      style={{
        borderTop: borderTop ? `1px solid ${BORDER}` : undefined,
        borderBottom: borderBottom ? `1px solid ${BORDER}` : undefined,
        backgroundColor: BG,
        position: 'relative',
        zIndex: 2,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: MAX_W,
          margin: '0 auto',
          padding: '64px 24px',
        }}
      >
        {children}
      </div>
    </section>
  )
}

function NumberedItem({
  num,
  body,
  fullWidth,
}: {
  num: string
  body: string
  fullWidth?: boolean
}) {
  return (
    <div
      style={{
        gridColumn: fullWidth ? '1 / -1' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 56,
          fontWeight: 300,
          color: WHITE,
          fontFamily: FONT,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {num}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: SEC,
          fontFamily: FONT,
          lineHeight: 1.65,
        }}
      >
        {body}
      </p>
    </div>
  )
}
