'use client'

/**
 * Gallery of the SVG graphics used in src/app/landing/page.tsx.
 *
 * Self-contained: design tokens, color helpers, and the AboutChart graphic
 * are duplicated here so this file is independent of page.tsx (mirroring
 * page.tsx's own self-contained style). The AboutChart line chart is fed
 * mock data points.
 *
 * To render this as a Next.js route, move it to
 * src/app/landing/animation/page.tsx.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'

// ───────────────────────────────────────────────────────────────────────────
//   Design tokens
// ───────────────────────────────────────────────────────────────────────────

const BG = 'rgb(10,10,10)'
const WHITE = '#ffffff'
const SEC = '#a1a1aa'
const BORDER = '#27272a'
const POSITIVE = '#04df9d'
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

// Same roster as the reel canvas carousel (TikTokCanvas INDEX_HERO_IDS)
const HERO_IDS = [
  '3TVXtAsR1Inumwj472S9r4', // Drake
  '5K4W6rqBFWDnAN6FQUkS6x', // Kanye West
  '2YZyLoL8N0Wb9xBt1NhZWg', // Kendrick Lamar
  '7tYKF4w9nC0nq9CsPZTHyP', // SZA
  '3DbwFQlvLxRSi2uX8mf81A', // Sexyy Red
  '3fMbdgg4jU18AjLCKBhRSm', // Michael Jackson
  '5pKCCKE2ajJHZ9KAiaK11H', // Rihanna
  '0du5cEVh5yTK9QJze8zA0C', // Bruno Mars
  '74KM79TiuVKeVCqs8QtB0B', // Sabrina Carpenter
  '1uNFoZAHBGtllmzznpCI3s', // Justin Bieber
  '1Xyo4u8uXC1ZmMpatF05PJ', // The Weeknd
  '699OTQXzgjhIYAHMy9RyPD', // Playboi Carti
  '4q3ewBCX7sLwd24euuV69X', // Bad Bunny
  '7dGJo4pcD2V6oG8kP0tJRR', // Eminem
  '0Y5tJX1MQlPlqiwlOH1tJY', // Travis Scott
  '1McMsnEElThX1knmY4oliG', // Olivia Rodrigo
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
        // Retry once on a transient miss — 16 parallel fetches can briefly
        // rate-limit the backend on a cold cache.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 400))
          if (cancelled) return null
          try {
            const res = await fetch(
              `/api/artist/${encodeURIComponent(id)}?slim=true`,
            )
            if (res.ok) {
              const data = await res.json()
              if (data?.artist) return data.artist as ArtistData
            }
          } catch {
            // fall through to retry
          }
        }
        return null
      }),
    ).then((rs) => {
      if (cancelled) return
      const list = rs.filter(Boolean) as ArtistData[]
      // Non-deterministic shuffle so the chart cycles through artists in a
      // random order (fresh each load), matching the reel canvas carousel.
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = list[i]
        list[i] = list[j]
        list[j] = tmp
      }
      setArtists(list)
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

// Axis styling — mirrors SXPriceChartWidget in the Indextrading app
const AXIS_YW = 44 // right gutter reserved for the y-axis price labels
const AXIS_PAD_T = 40
const AXIS_PAD_B = 56
const AXIS_MUTED = '#71717a'
const AXIS_GRID = '#48484f'
function formatAxisDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function AboutChart({
  data = [],
  height: H = 260,
  duration = 8000,
  showPulse = true,
  strokeWidth = 2,
  padY = 20,
  axes = false,
  windowMs,
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
  axes?: boolean
  windowMs?: number
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
    let pts = data
      .map((p) => ({
        timestamp: new Date(p.timestamp).getTime(),
        price: parseFloat(String(p.index)),
      }))
      .filter((p) => !isNaN(p.timestamp) && !isNaN(p.price))
      .sort((a, b) => a.timestamp - b.timestamp)
    if (!pts.length) return []
    // Restrict to a recent window so a fast move isn't squeezed into a
    // near-vertical line by years of history (matches the real chart's period).
    if (windowMs) {
      const cutoff = Date.now() - windowMs
      const win = pts.filter((p) => p.timestamp >= cutoff)
      if (win.length >= 2) pts = win
    }
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
  }, [data, windowMs])

  const firstPrice = chartData[0]?.price ?? 0
  const lastPrice = chartData[chartData.length - 1]?.price ?? 0
  const isPos = lastPrice >= firstPrice
  const targetC = isPos ? C_POSITIVE : C_NEGATIVE
  const minP = chartData.length ? Math.min(...chartData.map((d) => d.price)) : 0
  const maxP = chartData.length ? Math.max(...chartData.map((d) => d.price)) : 1
  const pRange = maxP === minP ? 1 : maxP - minP
  // Vertical headroom (axes only): the line maps to [loP, hiP] and the
  // gridlines bracket that same range, so the peak/trough stay inside the
  // gridded area instead of running off the top/bottom.
  const PRICE_PAD = axes ? pRange * 0.08 : 0
  const loP = minP - PRICE_PAD
  const vRange = pRange + 2 * PRICE_PAD
  const tStart = chartData[0]?.timestamp ?? 0
  const tEnd = chartData[chartData.length - 1]?.timestamp ?? tStart + 1
  const tRange = tEnd - tStart || 1
  // With axes on, reserve a right gutter for the y-axis labels and use the
  // SXPriceChartWidget vertical padding so the x-axis labels have room.
  const Y_AXIS_W = axes ? AXIS_YW : 0
  const CHART_W = Math.max(0, W - Y_AXIS_W)
  const PAD_T = axes ? AXIS_PAD_T : padY
  const PAD_B = axes ? AXIS_PAD_B : padY

  const points = useMemo(
    () =>
      chartData.map((d) => ({
        x: ((d.timestamp - tStart) / tRange) * CHART_W,
        y: PAD_T + (1 - (d.price - loP) / vRange) * (H - PAD_T - PAD_B),
        price: d.price,
      })),
    [chartData, CHART_W, tStart, tRange, loP, vRange, H, PAD_T, PAD_B],
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
      {/* Y-axis: horizontal dashed gridlines + right-side price labels */}
      {axes &&
        [0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const chartAreaH = H - PAD_T - PAD_B
          const gy = PAD_T + frac * chartAreaH
          const gridPrice = chartData.length ? loP + vRange * (1 - frac) : null
          return (
            <div
              key={frac}
              style={{ position: 'absolute', top: gy, left: 0, right: 0, pointerEvents: 'none' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: AXIS_YW,
                  height: 1,
                  backgroundImage: `repeating-linear-gradient(to right, ${AXIS_GRID} 0px, ${AXIS_GRID} 1px, transparent 1px, transparent 5px)`,
                }}
              />
              {gridPrice != null && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 2,
                    transform: 'translateY(-50%)',
                    fontSize: 10,
                    fontFamily: 'var(--font-geist-sans)',
                    color: AXIS_MUTED,
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}
                >
                  {gridPrice.toFixed(2)}
                </div>
              )}
            </div>
          )
        })}

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

      {/* X-axis: evenly-spaced date tick labels along the bottom */}
      {axes &&
        chartData.length > 1 &&
        Array.from({ length: 5 }, (_, i) => {
          const ts = tStart + (i * tRange) / 4
          const leftPct = ((ts - tStart) / tRange) * (CHART_W / Math.max(W, 1)) * 100
          const transform =
            i === 0 ? 'translateX(0)' : i === 4 ? 'translateX(-100%)' : 'translateX(-50%)'
          return (
            <div
              key={i}
              style={{ position: 'absolute', bottom: 6, left: `${leftPct}%`, transform, pointerEvents: 'none' }}
            >
              <span style={{ fontSize: 10, color: AXIS_MUTED, fontFamily: 'var(--font-geist-sans)' }}>
                {formatAxisDate(ts)}
              </span>
            </div>
          )
        })}
    </div>
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
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
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
          justifyContent: 'center',
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
          pts
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

// ───────────────────────────────────────────────────────────────────────────
//   CompareChart — two artists side by side on one shared price scale
// ───────────────────────────────────────────────────────────────────────────

type CmpPt = { x: number; y: number; price: number }

// Windowed + downsampled price series for one artist
function compareSeries(data: DataPoint[] | undefined, windowMs?: number) {
  if (!data) return [] as { t: number; price: number }[]
  let pts = data
    .map((p) => ({ t: new Date(p.timestamp).getTime(), price: parseFloat(String(p.index)) }))
    .filter((p) => !isNaN(p.t) && !isNaN(p.price))
    .sort((a, b) => a.t - b.t)
  if (windowMs && pts.length >= 2) {
    const cutoff = Date.now() - windowMs
    const win = pts.filter((p) => p.t >= cutoff)
    if (win.length >= 2) pts = win
  }
  if (pts.length > 200) {
    const step = (pts.length - 1) / 199
    pts = Array.from({ length: 200 }, (_, i) => pts[Math.min(Math.round(i * step), pts.length - 1)])
  }
  return pts
}

// Leading dot (position + interpolated price) along a polyline at draw progress
// Linear-interpolated price at an arbitrary time within a series — gives the
// replay cursor a leading point that glides smoothly between daily samples.
function valueAt(s: { t: number; price: number }[], time: number): number | null {
  if (!s.length) return null
  if (time <= s[0].t) return s[0].price
  if (time >= s[s.length - 1].t) return s[s.length - 1].price
  for (let i = 1; i < s.length; i++) {
    if (s[i].t >= time) {
      const a = s[i - 1]
      const b = s[i]
      const f = b.t === a.t ? 0 : (time - a.t) / (b.t - a.t)
      return a.price + (b.price - a.price) * f
    }
  }
  return s[s.length - 1].price
}

// Representative colour of an artist's profile picture — used as their line
// colour. We linearise each pixel out of sRGB and average in linear light (then
// re-encode) for a gamma-correct mean, and we weight each pixel by its chroma
// (max - min) so bright, colourful pixels dominate and neutral / grey (and
// dark) ones barely count — otherwise the mean washes out to grey. i.scdn.co serves
// `access-control-allow-origin: *`, so the canvas readback isn't tainted; on
// the rare failure the hook returns null and the caller falls back to grey.
function useAverageColor(url: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        // sRGB (0..1) <-> linear-light, the standard sRGB transfer functions.
        const toLinear = (c: number) =>
          c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
        const toSrgb = (l: number) =>
          l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055

        // Draw at (capped) native resolution so the browser's downscaler does
        // not pre-average in gamma space and reintroduce the very error we're
        // trying to avoid.
        const maxDim = 1024
        const scale = Math.min(
          1,
          maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1),
        )
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)

        // Weight each pixel by its chroma (max - min) so bright, colourful
        // pixels dominate. Unlike HSV saturation, chroma is brightness-aware, so
        // dark colours count proportionally less (and grey still counts as 0).
        // Still averaged in linear light, then re-encoded.
        const CHROMA_POW = 2 // higher = more strongly favour vivid pixels
        let rl = 0
        let gl = 0
        let bl = 0
        let wSum = 0 // sum of chroma weights
        let rlFlat = 0
        let glFlat = 0
        let blFlat = 0
        let n = 0 // plain pixel count (greyscale fallback)
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 16) continue // skip near-transparent pixels
          const sr = data[i] / 255
          const sg = data[i + 1] / 255
          const sb = data[i + 2] / 255
          const maxc = Math.max(sr, sg, sb)
          const minc = Math.min(sr, sg, sb)
          const chroma = maxc - minc // 0 for grey, low for dark colours, high for bright vivid
          const lr = toLinear(sr)
          const lg = toLinear(sg)
          const lb = toLinear(sb)
          const w = Math.pow(chroma, CHROMA_POW)
          rl += w * lr
          gl += w * lg
          bl += w * lb
          wSum += w
          rlFlat += lr
          glFlat += lg
          blFlat += lb
          n += 1
        }
        // Use the saturation-weighted mean; fall back to the plain mean only if
        // the cover is essentially greyscale (no colour worth weighting).
        const useWeighted = wSum > 1e-3
        const denom = useWeighted ? wSum : n
        const er = useWeighted ? rl : rlFlat
        const eg = useWeighted ? gl : glFlat
        const eb = useWeighted ? bl : blFlat
        if (denom > 0) {
          const r = Math.round(toSrgb(er / denom) * 255)
          const g = Math.round(toSrgb(eg / denom) * 255)
          const b = Math.round(toSrgb(eb / denom) * 255)
          setColor(`rgb(${r},${g},${b})`)
        }
      } catch {
        // Tainted canvas / read failure — keep the fallback colour
      }
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [url])
  return color
}

function CompareChart({
  artistA,
  artistB,
  height: H = 420,
  windowMs,
}: {
  artistA: ArtistData | null
  artistB: ArtistData | null
  height?: number
  windowMs?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = useId() // unique clip-path ids for the leading-edge avatars
  const [W, setW] = useState(700)
  const [cursorT, setCursorT] = useState(0) // 0..1 position within the replay
  const rafRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const LEAD_R = 16 // leading-edge avatar radius

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

  // 18-month data pool per artist; the replay reveals progressively within it.
  const sA = useMemo(() => compareSeries(artistA?.data_points, windowMs), [artistA, windowMs])
  const sB = useMemo(() => compareSeries(artistB?.data_points, windowMs), [artistB, windowMs])

  // Replay time domain: earliest point across both -> latest across both.
  const tStart = useMemo(() => {
    const f: number[] = []
    if (sA.length) f.push(sA[0].t)
    if (sB.length) f.push(sB[0].t)
    return f.length ? Math.min(...f) : 0
  }, [sA, sB])
  const tEnd = useMemo(() => {
    const l: number[] = []
    if (sA.length) l.push(sA[sA.length - 1].t)
    if (sB.length) l.push(sB[sB.length - 1].t)
    return l.length ? Math.max(...l) : 1
  }, [sA, sB])

  // Looping cursor: grow the window over GROW ms, hold at full, reset, repeat.
  const dataKey = `${artistA?.name ?? ''}|${artistB?.name ?? ''}|${sA.length}|${sB.length}`
  useEffect(() => {
    if (sA.length < 2 && sB.length < 2) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = performance.now()
    const GROW = 7000 // ~18 months of growth
    const HOLD = 1200 // pause on the full view before looping back
    const CYCLE = GROW + HOLD
    const animate = (now: number) => {
      const phase = (now - startRef.current) % CYCLE
      setCursorT(Math.min(phase / GROW, 1))
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  const PAD_T = AXIS_PAD_T
  const PAD_B = AXIS_PAD_B
  const chartAreaH = H - PAD_T - PAD_B
  const CHART_W = Math.max(0, W - AXIS_YW)

  // Window left edge pinned at tStart (18 months ago); the cursor (right edge)
  // advances toward tEnd. Starts ~1 month wide so there is always a line and a
  // leading point sitting on the right edge.
  const fullSpan = Math.max(tEnd - tStart, 1)
  const minWin = Math.min(30 * 24 * 60 * 60 * 1000, fullSpan)
  const cursorTime = tStart + minWin + cursorT * (fullSpan - minWin)
  const winRange = Math.max(cursorTime - tStart, 1)

  // Reveal each series up to the cursor, plus an interpolated point AT the
  // cursor so the leading edge glides smoothly between samples.
  const reveal = (s: { t: number; price: number }[]) => {
    const out = s.filter((p) => p.t <= cursorTime)
    const lead = valueAt(s, cursorTime)
    if (lead != null && (!out.length || out[out.length - 1].t < cursorTime)) {
      out.push({ t: cursorTime, price: lead })
    }
    return out
  }
  const revA = reveal(sA)
  const revB = reveal(sB)

  // Price (y) scale from the REVEALED data of both artists, so the horizontal
  // gridlines rescale up/down as the window grows.
  const rPrices = [...revA, ...revB].map((p) => p.price)
  const minP = rPrices.length ? Math.min(...rPrices) : 0
  const maxP = rPrices.length ? Math.max(...rPrices) : 1
  const pRange = maxP === minP ? 1 : maxP - minP
  const PAD = pRange * 0.08
  const loP = minP - PAD
  const vRange = pRange + 2 * PAD

  // Project the revealed window [tStart, cursorTime] across the full width, so
  // the leading point sits on the right edge and the axis rescales as it grows.
  const project = (s: { t: number; price: number }[]): CmpPt[] =>
    s.map((p) => ({
      x: ((p.t - tStart) / winRange) * CHART_W,
      y: PAD_T + (1 - (p.price - loP) / vRange) * chartAreaH,
      price: p.price,
    }))
  const ptsA = project(revA)
  const ptsB = project(revB)

  const pathStr = (pts: CmpPt[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const pathA = pathStr(ptsA)
  const pathB = pathStr(ptsB)

  // Fixed line colour = the average colour of each artist's profile picture
  // (no trend-based green/red, and it no longer animates).
  const colorA = useAverageColor(artistA?.image_url) ?? '#9ca3af'
  const colorB = useAverageColor(artistB?.image_url) ?? '#9ca3af'

  // Leading point (right edge) drives the dot + the header readout.
  const leadA = ptsA[ptsA.length - 1] ?? null
  const leadB = ptsB[ptsB.length - 1] ?? null
  const chgFor = (rev: { t: number; price: number }[]) => {
    if (rev.length < 2) return null
    const first = rev[0].price
    const last = rev[rev.length - 1].price
    return {
      rawChange: last - first,
      percentChange: first > 0 ? ((last - first) / first) * 100 : 0,
    }
  }

  // Leading-edge marker = the artist's profile picture (clipped to a circle)
  // ringed with a thin stroke in the line colour. Falls back to a dot if the
  // image is missing.
  const renderLead = (
    lead: CmpPt | null,
    ptsLen: number,
    color: string,
    image: string | null | undefined,
    key: string,
  ) => {
    if (!lead || ptsLen < 2) return null
    if (!image) return <circle key={key} cx={lead.x} cy={lead.y} r="3.5" fill={color} />
    // Pin the circle's centre-left (9 o'clock) to the line's endpoint: shift the
    // whole marker right by its radius so the line attaches at the left edge.
    const cx = lead.x + LEAD_R
    const cy = lead.y
    const clipId = `${uid}-${key}`
    return (
      <g key={key}>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={LEAD_R} />
        </clipPath>
        <image
          href={image}
          x={cx - LEAD_R}
          y={cy - LEAD_R}
          width={LEAD_R * 2}
          height={LEAD_R * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
        <circle cx={cx} cy={cy} r={LEAD_R} fill="none" stroke={color} strokeWidth={2.5} />
      </g>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 760 }}>
      {/* One header per artist */}
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ChartArtistHeader
            artist={artistA}
            drawingPrice={leadA ? leadA.price : null}
            fallbackPrice={artistA?.index_price ?? 0}
            changeData={chgFor(revA)}
            chartColor={colorA}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ChartArtistHeader
            artist={artistB}
            drawingPrice={leadB ? leadB.price : null}
            fallbackPrice={artistB?.index_price ?? 0}
            changeData={chgFor(revB)}
            chartColor={colorB}
          />
        </div>
      </div>

      {/* Shared chart: both lines overlaid on one growing, rescaling axis */}
      <div style={{ width: '100%', height: H, position: 'relative' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const gy = PAD_T + frac * chartAreaH
          const price = rPrices.length ? loP + vRange * (1 - frac) : null
          return (
            <div key={frac} style={{ position: 'absolute', top: gy, left: 0, right: 0, pointerEvents: 'none' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: AXIS_YW,
                  height: 1,
                  backgroundImage: `repeating-linear-gradient(to right, ${AXIS_GRID} 0px, ${AXIS_GRID} 1px, transparent 1px, transparent 5px)`,
                }}
              />
              {price != null && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 2,
                    transform: 'translateY(-50%)',
                    fontSize: 10,
                    fontFamily: 'var(--font-geist-sans)',
                    color: AXIS_MUTED,
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}
                >
                  {price.toFixed(2)}
                </div>
              )}
            </div>
          )
        })}
        <svg ref={svgRef} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
          {pathA && ptsA.length >= 2 && (
            <path
              d={pathA}
              fill="none"
              stroke={colorA}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {pathB && ptsB.length >= 2 && (
            <path
              d={pathB}
              fill="none"
              stroke={colorB}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {renderLead(leadA, ptsA.length, colorA, artistA?.image_url, 'a')}
          {renderLead(leadB, ptsB.length, colorB, artistB?.image_url, 'b')}
        </svg>

        {/* X-axis date ticks across the current (growing) window */}
        {winRange > 1 &&
          Array.from({ length: 5 }, (_, i) => {
            const ts = tStart + (i * winRange) / 4
            const leftPct = ((ts - tStart) / winRange) * (CHART_W / Math.max(W, 1)) * 100
            const transform =
              i === 0 ? 'translateX(0)' : i === 4 ? 'translateX(-100%)' : 'translateX(-50%)'
            return (
              <div
                key={i}
                style={{ position: 'absolute', bottom: 6, left: `${leftPct}%`, transform, pointerEvents: 'none' }}
              >
                <span style={{ fontSize: 10, color: AXIS_MUTED, fontFamily: 'var(--font-geist-sans)' }}>
                  {formatAxisDate(ts)}
                </span>
              </div>
            )
          })}
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
  // Compare tile uses a stable pair (first two of the shuffled roster) so its
  // replay loops the SAME two artists continuously, independent of the hero cycle.
  const compareA = heroArtists[0] ?? null
  const compareB = heroArtists.length > 1 ? heroArtists[1] : null
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
          <Tile title="AboutChart">
            <div
              style={{
                width: '100%',
                maxWidth: 540,
                opacity,
                transition: 'opacity 0.6s ease',
              }}
            >
              {/* Header kept at its original width; only the chart widens */}
              <div style={{ maxWidth: 260 }}>
                <ChartArtistHeader
                  artist={artist}
                  drawingPrice={drawingPrice}
                  fallbackPrice={fallbackPrice}
                  changeData={changeData}
                  chartColor={chartColor}
                />
              </div>
              <AboutChart
                data={chartData}
                height={560}
                axes
                windowMs={365 * 24 * 60 * 60 * 1000}
                onPrice={setDrawingPrice}
                onChangeData={setChangeData}
                onColor={setChartColor}
              />
            </div>
          </Tile>

          <Tile title="Compare (two artists)">
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <CompareChart
                artistA={compareA}
                artistB={compareB}
                height={500}
                windowMs={548 * 24 * 60 * 60 * 1000 /* ~18 months */}
              />
            </div>
          </Tile>
        </div>
      </div>
    </div>
  )
}
