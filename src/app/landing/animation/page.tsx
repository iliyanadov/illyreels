'use client'

/**
 * Gallery of the SVG graphics used in src/app/landing/page.tsx.
 *
 * Self-contained: design tokens, color helpers, and each of the four SVG
 * components are duplicated here so this file is independent of page.tsx
 * (mirroring page.tsx's own self-contained style). No API calls — the
 * AboutChart is fed mock data points, and FoundationsGraphic's embedded
 * TopArtistsList is omitted.
 *
 * To render this as a Next.js route, move it to
 * src/app/landing/animation/page.tsx.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'

// ───────────────────────────────────────────────────────────────────────────
//   Design tokens
// ───────────────────────────────────────────────────────────────────────────

const BG = 'rgb(10,10,10)'
const WHITE = '#ffffff'
const SEC = '#a1a1aa'
const BORDER = '#27272a'
const POSITIVE = '#04df9d'
const NEGATIVE = '#FF4B4B'
const FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

// ───────────────────────────────────────────────────────────────────────────
//   Color helpers
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
//   Hero artist fetching (same Spotify IDs as the landing)
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
  change_1m?: number | null
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
//   AboutChart — animated draw-on line chart
// ───────────────────────────────────────────────────────────────────────────

function AboutChart({
  data = [],
  height: H = 260,
  duration = 8000,
  showPulse = true,
  strokeWidth = 2,
  padY = 20,
  easing = 'easeOut',
  onPrice,
  onChangeData,
  onColor,
}: {
  data?: DataPoint[]
  height?: number
  duration?: number
  showPulse?: boolean
  strokeWidth?: number
  padY?: number
  easing?: 'easeOut' | 'easeOutSoft' | 'easeInOut' | 'linear'
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
  const PAD_T = padY
  const PAD_B = padY

  const points = useMemo(
    () =>
      chartData.map((d) => ({
        x: ((d.timestamp - tStart) / tRange) * W,
        y: PAD_T + (1 - (d.price - minP) / pRange) * (H - PAD_T - PAD_B),
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
    const animate = (now: number) => {
      const t = Math.min((now - startRef.current) / duration, 1)
      const eased =
        easing === 'linear'
          ? t
          : easing === 'easeInOut'
            ? t < 0.5
              ? 4 * t * t * t
              : 1 - Math.pow(-2 * t + 2, 3) / 2
            : easing === 'easeOutSoft'
              ? 1 - Math.pow(1 - t, 2)
              : 1 - Math.pow(1 - t, 3)
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
    <div style={{ width: '100%', height: H, position: 'relative' }}>
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
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
          />
        )}
        {last && done ? (
          <>
            {showPulse && (
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
            )}
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

function FoundationsGraphic({ artists }: { artists: ArtistData[] }) {
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
            <circle key={`c${i}-${extra}`} r="2.5" fill="white" opacity="0">
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
      <TopArtistsList artists={artists} />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
//   TopArtistsList — cycles through the hero artists every 3s
// ───────────────────────────────────────────────────────────────────────────

function TopArtistsList({
  artists,
  showChartGrid = true,
  logoBelow = false,
}: {
  artists: ArtistData[]
  showChartGrid?: boolean
  logoBelow?: boolean
}) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!artists.length) return
    // With the logo pinned below the cards there is no finale slide, so the
    // carousel only cycles through the artists themselves.
    const total = logoBelow ? artists.length : artists.length + 1
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % total)
    }, 6750)
    return () => clearInterval(t)
  }, [artists.length, logoBelow])

  if (!artists.length) return null

  // Final slide: Sonotrade logo (skipped when the logo is shown below instead)
  if (!logoBelow && idx === artists.length) {
    return (
      <div style={{ width: '100%', padding: '0 56px', marginTop: 0 }}>
        <LogoSlide key={`logo-${idx}`} />
      </div>
    )
  }

  const safeIdx = idx % artists.length
  const a = artists[safeIdx]
  const first = a.data_points?.[0]?.index
  const last = a.data_points?.[a.data_points.length - 1]?.index
  const computedChange =
    first != null && first > 0 && last != null
      ? ((last - first) / first) * 100
      : null
  const change = a.change_1m ?? computedChange

  return (
    <div style={{ width: '100%', padding: '0 56px', marginTop: 0 }}>
      <CardContent key={`${a.name}-${safeIdx}`} artist={a} change={change} showChartGrid={showChartGrid} />
      {logoBelow && <LogoBelow />}
    </div>
  )
}

// Persistent Sonotrade lockup shown beneath the cycling cards (used in place of
// the finale slide). Mounts once and stays put while the cards cycle above it.
function LogoBelow() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 24,
        animation:
          'sxArtistFadeIn 0.6s cubic-bezier(0.25,0.46,0.45,0.94) both',
      }}
    >
      {/* The asset is a 1080×1350 poster with the wordmark in a band of empty
          space, so we crop to that band (overflow:hidden window) and size the
          image up — scaling the whole canvas would render the mark tiny. */}
      <div
        style={{
          width: 156,
          height: 48,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sonotradelogoname.png"
          alt="Sonotrade"
          style={{ width: 156, flexShrink: 0, display: 'block' }}
          draggable={false}
        />
      </div>
      <span
        style={{
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: WHITE,
          textAlign: 'center',
        }}
      >
        Link in bio
      </span>
    </div>
  )
}

function LogoSlide() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        padding: '24px 16px',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/sonotradelogoname.png"
        alt="Sonotrade"
        style={{
          height: 180,
          width: 'auto',
          display: 'block',
          animation:
            'sxArtistFadeIn 0.6s cubic-bezier(0.25,0.46,0.45,0.94) both',
        }}
        draggable={false}
      />
      <span
        style={{
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: WHITE,
          textAlign: 'center',
          animation:
            'sxTextPop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.7s both',
        }}
      >
        Trade on your favorite artist
      </span>
    </div>
  )
}

function CardContent({
  artist,
  change,
  showChartGrid = true,
}: {
  artist: ArtistData
  change: number | null
  showChartGrid?: boolean
}) {
  const fallbackPrice = artist.index_price ?? 0
  const [drawingPrice, setDrawingPrice] = useState<number | null>(null)
  const [drawingPercent, setDrawingPercent] = useState<number | null>(null)

  return (
    <div
      style={{
        animation:
          'sxArtistFadeIn 0.6s cubic-bezier(0.25,0.46,0.45,0.94) both',
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
        {artist.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.image_url}
            alt={artist.name}
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
        <div style={{ minWidth: 0, flexShrink: 0, width: 110 }}>
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
            {artist.name}
          </div>
          <div
            style={{
              color: SEC,
              fontFamily: FONT,
              fontSize: 12,
              marginTop: 2,
            }}
          >
            Index
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: 56,
            ...(showChartGrid
              ? {
                  border: '1px dashed rgba(255,0,255,0.55)',
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,0,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,0,255,0.18) 1px, transparent 1px)',
                  backgroundSize: '10px 10px',
                }
              : {}),
          }}
        >
          <AboutChart
            data={artist.data_points}
            height={56}
            duration={4500}
            showPulse={false}
            strokeWidth={1.5}
            padY={0}
            easing="easeOutSoft"
            onPrice={setDrawingPrice}
            onChangeData={(d) => setDrawingPercent(d.percentChange)}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 6,
            flexShrink: 0,
            width: 92,
          }}
        >
          <span style={{ color: SEC, fontFamily: FONT, fontSize: 12 }}>
            <NumberFlow
              value={drawingPrice ?? fallbackPrice}
              format={{
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }}
            />
            <span style={{ fontSize: 10, marginLeft: 4, fontWeight: 400 }}>
              points
            </span>
          </span>
          {change != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                <NumberFlow
                  value={
                    drawingPercent != null ? Math.abs(drawingPercent) : 0
                  }
                  format={{
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }}
                  suffix="%"
                />
              </span>
            </div>
          )}
        </div>
      </span>
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
    <svg
      width="500"
      height="500"
      viewBox="0 0 500 500"
      style={{ overflow: 'visible' }}
    >
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
        <circle
          key={`n${i}`}
          cx={x}
          cy={y}
          r="22"
          fill={BORDER}
          opacity="0.8"
        />
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
const R_AXES = [
  'STREAMING',
  'POSITIONING',
  'CONVICTION',
  'MOMENTUM',
  'VOLUME',
  'SIGNAL',
]
const R_ANGLES = Array.from(
  { length: 6 },
  (_, i) => -Math.PI / 2 + i * (Math.PI / 3),
)
const RV1 = [0.82, 0.88, 0.72, 0.85, 0.65, 0.9]
const RV2 = [0.75, 0.92, 0.8, 0.78, 0.88, 0.7]
const RVD = [0.4, 0.5, 0.45, 0.55, 0.35, 0.48]
const SP = '0.45 0 0.55 1;0.45 0 0.55 1'

function rPoly(vals: number[]) {
  return vals
    .map(
      (v, i) =>
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
    <svg
      width="460"
      height="460"
      viewBox="0 0 460 460"
      style={{ display: 'block', overflow: 'visible' }}
    >
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
            values={`${rPoly(RV1.map((v) => v * s))};${rPoly(
              RV2.map((v) => v * s),
            )};${rPoly(RV1.map((v) => v * s))}`}
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
//   Mock data for AboutChart
// ───────────────────────────────────────────────────────────────────────────

function makeMockData(): DataPoint[] {
  const now = Date.now()
  const N = 80
  return Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1)
    const trend = 100 + t * 45
    const noise =
      Math.sin(i * 0.55) * 5 + Math.sin(i * 0.18) * 3 + Math.sin(i * 1.3) * 1.4
    return {
      index: trend + noise,
      timestamp: new Date(now - (N - 1 - i) * 60_000).toISOString(),
    }
  })
}

// ───────────────────────────────────────────────────────────────────────────
//   Gallery page
// ───────────────────────────────────────────────────────────────────────────

function Tile({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 40,
        backgroundColor: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      <span
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: SEC,
          fontFamily: FONT,
        }}
      >
        {title}
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 520,
          padding: '24px 0',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function ChartArtistHeader({
  artist,
  drawingPrice,
  fallbackPrice,
  changeData,
  chartColor,
}: {
  artist: ArtistData | null
  drawingPrice: number | null
  fallbackPrice: number
  changeData: { percentChange: number; rawChange: number } | null
  chartColor: string
}) {
  const name = artist?.name ?? 'Loading…'
  const imageUrl = artist?.image_url
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
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
          {name}
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
          <NumberFlow
            value={drawingPrice ?? fallbackPrice}
            format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
            prefix="$"
          />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
              <span
                style={{ color: chartColor, fontSize: 16, fontFamily: FONT }}
              >
                <NumberFlow
                  value={Math.abs(changeData.percentChange)}
                  format={{
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }}
                  suffix="%"
                />
              </span>
            </div>
            <span
              style={{ color: chartColor, fontSize: 16, fontFamily: FONT }}
            >
              <NumberFlow
                value={Math.abs(changeData.rawChange)}
                format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                prefix={changeData.rawChange >= 0 ? '+$' : '-$'}
              />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LandingAnimations() {
  const { artists: heroArtists, loaded: heroLoaded } = useHeroArtists()
  const mockData = useMemo(makeMockData, [])
  const [displayIndex, setDisplayIndex] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const [drawingPrice, setDrawingPrice] = useState<number | null>(null)
  const [changeData, setChangeData] = useState<{
    percentChange: number
    rawChange: number
  } | null>(null)
  const [chartColor, setChartColor] = useState(POSITIVE)

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
  const chartData = artist?.data_points ?? mockData
  const fallbackPrice =
    artist?.index_price ?? mockData[mockData.length - 1]?.index ?? 0

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: BG,
        color: WHITE,
        fontFamily: FONT,
        padding: '64px 24px',
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
        @keyframes sxTextPop {
          0%   { opacity: 0; transform: translateY(14px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div style={{ maxWidth: 1300, margin: '0 auto' }}>
        <h1
          style={{
            margin: '0 0 48px',
            fontSize: 40,
            fontWeight: 300,
            letterSpacing: '-0.02em',
          }}
        >
          Landing page SVG animations
        </h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))',
            gap: 24,
          }}
        >
          <Tile title="CTA animation">
            <div style={{ width: 560 }}>
              <TopArtistsList artists={heroArtists} />
            </div>
          </Tile>

          <Tile title="CTA animation 2">
            <div style={{ width: 560 }}>
              <TopArtistsList artists={heroArtists} showChartGrid={false} logoBelow />
            </div>
          </Tile>

          <Tile title="AboutChart">
            <div
              style={{
                width: '100%',
                maxWidth: 560,
                opacity,
                transition: 'opacity 0.6s ease',
              }}
            >
              <ChartArtistHeader
                artist={artist}
                drawingPrice={drawingPrice}
                fallbackPrice={fallbackPrice}
                changeData={changeData}
                chartColor={chartColor}
              />
              <AboutChart
                data={chartData}
                height={260}
                onPrice={setDrawingPrice}
                onChangeData={setChangeData}
                onColor={setChartColor}
              />
            </div>
          </Tile>

          <Tile title="FoundationsGraphic">
            <FoundationsGraphic artists={heroArtists} />
          </Tile>

          <Tile title="CultureNetworkGraphic">
            <CultureNetworkGraphic />
          </Tile>

          <Tile title="RadarGraphic">
            <RadarGraphic />
          </Tile>
        </div>
      </div>
    </div>
  )
}
