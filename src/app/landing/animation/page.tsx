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

const HERO_INTERVAL_MS = 12000

interface DataPoint {
  index: number
  timestamp: string
}
interface ArtistData {
  id?: string
  name: string
  data_points: DataPoint[]
  image_url?: string | null
  index_price?: number | null
  change_1m?: number | null
}

function useHeroArtists() {
  // Two pre-fetched snapshots: Wikipedia pageviews (daily) and Google Trends
  // (monthly). Both are read as static files — zero data API calls at runtime.
  const [artists, setArtists] = useState<ArtistData[]>([]) // wiki
  const [trends, setTrends] = useState<ArtistData[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Stable alphabetical order so the artist dropdowns are consistent.
    const sortByName = (list: ArtistData[]) =>
      list.sort((a, b) => a.name.localeCompare(b.name))

    const DAY = 86400000
    // Expand the compact snapshot ({ start, values[] }) into data_points. The
    // Wikipedia file stores daily values from a common start date to keep ~11
    // years small; the Trends file is already in data_points form.
    type CompactArtist = ArtistData & { start?: string; values?: number[] }
    const expand = (a: CompactArtist): ArtistData => {
      if (Array.isArray(a.data_points)) return a
      if (a.start && Array.isArray(a.values)) {
        const t0 = new Date(`${a.start}T00:00:00Z`).getTime()
        const data_points: DataPoint[] = a.values.map((v, i) => ({
          timestamp: new Date(t0 + i * DAY).toISOString().slice(0, 10),
          index: v,
        }))
        return { id: a.id, name: a.name, image_url: a.image_url, index_price: a.index_price, data_points }
      }
      return { ...a, data_points: [] }
    }

    const load = async (url: string): Promise<ArtistData[]> => {
      try {
        const res = await fetch(url, { cache: 'force-cache' })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length) {
            return sortByName((data as CompactArtist[]).map(expand))
          }
        }
      } catch {
        // snapshot missing — return empty
      }
      return []
    }

    ;(async () => {
      const [wiki, gt] = await Promise.all([
        load('/artist-data.json'), // Wikipedia pageviews (daily)
        load('/trends-data.json'), // Google Trends (monthly)
      ])
      if (cancelled) return
      setArtists(wiki)
      setTrends(gt)
      setLoaded(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return { artists, trends, loaded }
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
const AXIS_GRID_SOFT = 'rgba(255,255,255,0.08)' // solid (non-dashed) interior gridlines
function formatAxisDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// "Nice" round step (…, 0.5, 1, 2, 5, 10, 20, 50, …) that splits `range` into
// roughly `target` intervals — used for round-number price gridlines.
function niceStep(range: number, target: number): number {
  if (!(range > 0) || !(target > 0)) return 1
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * mag
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
                  backgroundColor: AXIS_GRID_SOFT,
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
  aspect,
  maxWidth,
}: {
  title: string
  children: React.ReactNode
  aspect?: string
  maxWidth?: number
}) {
  const fill = !!aspect
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
        ...(fill
          ? {
              aspectRatio: aspect,
              maxWidth,
              width: '100%',
              margin: '0 auto',
              boxSizing: 'border-box' as const,
              border: `2px solid ${WHITE}`, // white square outline around the canvas
              borderRadius: 0,
              backgroundColor: BG, // opaque so the background grid doesn't show through
            }
          : {}),
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
          alignItems: fill ? 'stretch' : 'center',
          justifyContent: 'center',
          padding: '24px 0',
          ...(fill ? { flex: 1, minHeight: 0 } : { minHeight: 520 }),
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
  valuePrefix = '$',
  valueUnit = 'pts',
}: {
  artist: ArtistData | null
  drawingPrice: number | null
  fallbackPrice: number
  changeData: { percentChange: number; rawChange: number } | null
  chartColor: string
  valuePrefix?: string
  valueUnit?: string
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
            prefix={valuePrefix}
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
          {valueUnit}
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
                prefix={(changeData.rawChange >= 0 ? '+' : '-') + valuePrefix}
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

// Time extent [min, max] (ms) of an artist's raw data, for clamping the window.
function seriesExtent(data: DataPoint[] | undefined): [number, number] | null {
  if (!data || !data.length) return null
  let lo = Infinity
  let hi = -Infinity
  for (const p of data) {
    const t = new Date(p.timestamp).getTime()
    if (!isNaN(t)) {
      if (t < lo) lo = t
      if (t > hi) hi = t
    }
  }
  return lo <= hi ? [lo, hi] : null
}

// Price series for one artist, clipped to an absolute [start, end] window
// BEFORE downsampling, so daily detail is preserved within whatever range is
// selected (rather than downsampling the whole history first and losing it).
function compareSeries(
  data: DataPoint[] | undefined,
  range?: { start: number; end: number },
) {
  if (!data) return [] as { t: number; price: number }[]
  let pts = data
    .map((p) => ({ t: new Date(p.timestamp).getTime(), price: parseFloat(String(p.index)) }))
    .filter((p) => !isNaN(p.t) && !isNaN(p.price))
    .sort((a, b) => a.t - b.t)
  if (range) {
    const win = pts.filter((p) => p.t >= range.start && p.t <= range.end)
    pts = win
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
  height: heightProp = 620,
  windowStart,
  windowEnd,
  loopMs = 8200,
}: {
  artistA: ArtistData | null
  artistB: ArtistData | null
  height?: number
  windowStart?: number
  windowEnd?: number
  loopMs?: number
}) {
  const chartBoxRef = useRef<HTMLDivElement>(null)
  const uid = useId() // unique clip-path ids for the leading-edge avatars
  const [W, setW] = useState(700)
  const [H, setH] = useState(heightProp) // chart-area height, measured so it fills the card
  const [cursorT, setCursorT] = useState(0) // 0..1 position within the replay
  const rafRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const LEAD_R = 16 // leading-edge avatar radius

  // The chart area fills whatever height the (fixed-ratio) card leaves, so we
  // measure the container and drive the SVG + projections from that.
  useEffect(() => {
    const update = () => {
      const el = chartBoxRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width > 0) setW(r.width)
      if (r.height > 0) setH(r.height)
    }
    update()
    const ro = new ResizeObserver(update)
    if (chartBoxRef.current) ro.observe(chartBoxRef.current)
    return () => ro.disconnect()
  }, [])

  // Extent of the available data across the selected artist(s) (from raw data,
  // before any downsampling — so clamping the window is exact).
  const extentA = useMemo(() => seriesExtent(artistA?.data_points), [artistA])
  const extentB = useMemo(() => seriesExtent(artistB?.data_points), [artistB])
  const dataMin = useMemo(() => {
    const f: number[] = []
    if (extentA) f.push(extentA[0])
    if (extentB) f.push(extentB[0])
    return f.length ? Math.min(...f) : 0
  }, [extentA, extentB])
  const dataMax = useMemo(() => {
    const l: number[] = []
    if (extentA) l.push(extentA[1])
    if (extentB) l.push(extentB[1])
    return l.length ? Math.max(...l) : 1
  }, [extentA, extentB])

  // Selected window, clamped to the available data (falls back to full extent).
  const tStart = Math.min(Math.max(windowStart ?? dataMin, dataMin), dataMax)
  const tEndClamped = Math.max(Math.min(windowEnd ?? dataMax, dataMax), dataMin)
  const tEnd = tEndClamped > tStart ? tEndClamped : dataMax

  // Series filtered to the window FIRST, then downsampled — preserves daily
  // detail inside whatever range is selected. The replay reveals within it.
  const sA = useMemo(
    () => compareSeries(artistA?.data_points, { start: tStart, end: tEnd }),
    [artistA, tStart, tEnd],
  )
  const sB = useMemo(
    () => compareSeries(artistB?.data_points, { start: tStart, end: tEnd }),
    [artistB, tStart, tEnd],
  )

  // Looping cursor: grow the window, hold briefly at full, reset, repeat. The
  // total loop time is `loopMs` (user-controlled), split ~85% growth / 15% hold.
  // Re-keyed on the window + loopMs so changing artists/dates/speed restarts it.
  const dataKey = `${artistA?.name ?? ''}|${artistB?.name ?? ''}|${tStart}|${tEnd}|${sA.length}|${sB.length}`
  useEffect(() => {
    if (sA.length < 2 && sB.length < 2) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = performance.now()
    const CYCLE = Math.max(loopMs, 1000) // total loop duration
    const GROW = CYCLE * 0.85 // growth phase
    const animate = (now: number) => {
      const phase = (now - startRef.current) % CYCLE
      setCursorT(Math.min(phase / GROW, 1)) // holds at 1 during the final ~15%
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, loopMs])

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

  // Round-number y gridlines. The step is sized to the FULL data range (fixed
  // for the whole replay), so as the revealed range grows, more lines spawn in.
  const fullPrices = [...sA, ...sB].map((p) => p.price)
  const fullMin = fullPrices.length ? Math.min(...fullPrices) : 0
  const fullMax = fullPrices.length ? Math.max(...fullPrices) : 1
  const gridStep = niceStep((fullMax - fullMin) || 1, 6)
  const gridLines: number[] = []
  if (rPrices.length && gridStep > 0 && vRange > 0) {
    const hiP = loP + vRange
    const firstLine = Math.ceil(loP / gridStep) * gridStep
    for (let p = firstLine, guard = 0; p <= hiP + 1e-6 && guard < 100; p += gridStep, guard++) {
      gridLines.push(p)
    }
  }

  // X axis: year labels, thinned so they never overlap. The step is based on the
  // FULL data span (stable through the replay), so a 22-year range collapses to a
  // handful of labels while a short span still shows every year. Each label is
  // centred under its year's visible span.
  const yearTicks: { year: number; left: number }[] = []
  if (winRange > 1 && CHART_W > 0) {
    const fullY0 = new Date(tStart).getFullYear()
    const fullY1 = new Date(tEnd).getFullYear()
    const spanYears = fullY1 - fullY0 + 1
    const yStep = spanYears <= 8 ? 1 : spanYears <= 16 ? 2 : spanYears <= 40 ? 5 : 10
    const y0 = new Date(tStart).getFullYear()
    const y1 = new Date(cursorTime).getFullYear()
    for (let y = y0; y <= y1; y++) {
      if ((y - fullY0) % yStep !== 0) continue // thin to avoid label overlap
      const spanStart = Math.max(new Date(y, 0, 1).getTime(), tStart)
      const spanEnd = Math.min(new Date(y + 1, 0, 1).getTime(), cursorTime)
      const center = (spanStart + spanEnd) / 2
      const left = ((center - tStart) / winRange) * (CHART_W / Math.max(W, 1)) * 100
      yearTicks.push({ year: y, left })
    }
  }

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

  // Straight segments between points. Daily data is dense enough to read as a
  // smooth line without spline interpolation.
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
        <text
          x={cx + LEAD_R + 5}
          y={cy}
          textAnchor="start"
          dominantBaseline="central"
          fontSize={13}
          fontWeight={700}
          fontFamily={FONT}
          fill={WHITE}
          stroke={BG}
          strokeWidth={4}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {lead.price.toFixed(1)}
        </text>
      </g>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 760, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* One header per artist (second one only when a 2nd artist is selected) */}
      <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
        <div style={{ flex: artistB ? '1 1 0' : '0 1 auto', minWidth: 0 }}>
          <ChartArtistHeader
            artist={artistA}
            drawingPrice={leadA ? leadA.price : null}
            fallbackPrice={artistA?.index_price ?? 0}
            changeData={chgFor(revA)}
            chartColor={colorA}
            valuePrefix=""
            valueUnit="pts"
          />
        </div>
        {artistB && (
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <ChartArtistHeader
              artist={artistB}
              drawingPrice={leadB ? leadB.price : null}
              fallbackPrice={artistB?.index_price ?? 0}
              changeData={chgFor(revB)}
              chartColor={colorB}
              valuePrefix=""
              valueUnit="pts"
            />
          </div>
        )}
      </div>

      {/* Shared chart: both lines overlaid on one growing, rescaling axis */}
      <div ref={chartBoxRef} style={{ width: '100%', flex: 1, minHeight: 0, position: 'relative' }}>
        {gridLines.map((price) => {
          const gy = PAD_T + (1 - (price - loP) / vRange) * chartAreaH
          return (
            <div key={price} style={{ position: 'absolute', top: gy, left: 0, right: 0, pointerEvents: 'none' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: AXIS_YW,
                  height: 1,
                  backgroundColor: AXIS_GRID_SOFT,
                }}
              />
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
            </div>
          )
        })}
        {/* Fixed bottom axis — always present; only the gridlines above vary */}
        <div
          style={{
            position: 'absolute',
            top: PAD_T + chartAreaH,
            left: 0,
            right: AXIS_YW,
            height: 1,
            backgroundColor: AXIS_GRID,
            pointerEvents: 'none',
          }}
        />
        {/* Fixed left axis (y-axis baseline) — always present */}
        <div
          style={{
            position: 'absolute',
            top: PAD_T,
            left: 0,
            width: 1,
            height: chartAreaH,
            backgroundColor: AXIS_GRID,
            pointerEvents: 'none',
          }}
        />
        <svg width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
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

        {/* X-axis: one label per visible calendar year, centred on its span */}
        {yearTicks.map(({ year, left }) => {
          const transform =
            left <= 8 ? 'translateX(0)' : left >= 92 ? 'translateX(-100%)' : 'translateX(-50%)'
          return (
            <div
              key={year}
              style={{ position: 'absolute', bottom: 6, left: `${left}%`, transform, pointerEvents: 'none' }}
            >
              <span style={{ fontSize: 10, color: AXIS_MUTED, fontFamily: 'var(--font-geist-sans)' }}>
                {year}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- Small styled controls for the comparison tool ----
const CONTROL_INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: WHITE,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 14,
  fontFamily: FONT,
  outline: 'none',
}
const CONTROL_LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: SEC,
  fontFamily: FONT,
}

function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={CONTROL_LABEL_STYLE}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={CONTROL_INPUT_STYLE}>
        {options.map((o) => (
          <option key={o.value || 'none'} value={o.value} style={{ background: '#111', color: WHITE }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ControlNumber({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (n: number) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={CONTROL_LABEL_STYLE}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(n)
        }}
        style={CONTROL_INPUT_STYLE}
      />
    </label>
  )
}

function ControlDate({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number | null
  min: number | null
  max: number | null
  onChange: (ms: number) => void
}) {
  const iso = (ms: number | null) => (ms != null ? new Date(ms).toISOString().slice(0, 10) : '')
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={CONTROL_LABEL_STYLE}>{label}</span>
      <input
        type="date"
        value={iso(value)}
        min={iso(min)}
        max={iso(max)}
        onChange={(e) => {
          const t = new Date(e.target.value).getTime()
          if (!Number.isNaN(t)) onChange(t)
        }}
        style={{ ...CONTROL_INPUT_STYLE, colorScheme: 'dark' }}
      />
    </label>
  )
}

export default function LandingAnimations() {
  const { artists: heroArtists, trends: trendsArtists, loaded: heroLoaded } = useHeroArtists()
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
  // ---- Interactive comparison controls: pick artist(s) + a date range ----
  // Date-range bounds span BOTH sources (Trends reaches 2004, Wikipedia 2015),
  // so the picker covers the full union; each chart clamps to its own data.
  const allArtists = useMemo(
    () => [...heroArtists, ...trendsArtists],
    [heroArtists, trendsArtists],
  )
  const dataMin = useMemo(() => {
    let m = Infinity
    for (const a of allArtists) {
      const t = a.data_points[0]?.timestamp
      if (t) m = Math.min(m, new Date(t).getTime())
    }
    return Number.isFinite(m) ? m : null
  }, [allArtists])
  const dataMax = useMemo(() => {
    let m = -Infinity
    for (const a of allArtists) {
      const dp = a.data_points
      const t = dp[dp.length - 1]?.timestamp
      if (t) m = Math.max(m, new Date(t).getTime())
    }
    return Number.isFinite(m) ? m : null
  }, [allArtists])

  const [selectedAId, setSelectedAId] = useState<string | null>(null)
  const [selectedBId, setSelectedBId] = useState<string | null | undefined>(undefined)
  const [rangeStart, setRangeStart] = useState<number | null>(null)
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const [loopSeconds, setLoopSeconds] = useState(8) // full-loop target duration

  // Defaults once the snapshot loads: first two artists, full date range.
  // (undefined = not yet initialised; null for artist B = user picked "None".)
  useEffect(() => {
    if (!heroArtists.length) return
    setSelectedAId((cur) => cur ?? heroArtists[0]?.id ?? null)
    setSelectedBId((cur) => (cur === undefined ? heroArtists[1]?.id ?? null : cur))
    setRangeStart((cur) => (cur == null ? dataMin : cur))
    setRangeEnd((cur) => (cur == null ? dataMax : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroArtists.length, dataMin, dataMax])

  // Same selected artists, resolved against each data source.
  const findA = (list: ArtistData[]) => list.find((a) => a.id === selectedAId) ?? null
  const findB = (list: ArtistData[]) =>
    selectedBId ? list.find((a) => a.id === selectedBId) ?? null : null
  const wikiA = findA(heroArtists)
  const wikiB = findB(heroArtists)
  const trendsA = findA(trendsArtists)
  const trendsB = findB(trendsArtists)
  const chartData = artist?.data_points ?? mockData
  const fallbackPrice =
    artist?.index_price ?? mockData[mockData.length - 1]?.index ?? 0

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: BG,
        backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
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
          {/* AboutChart hidden for now */}
          {false && (
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
          )}

          {/* Interactive comparison: shared controls, then both data sources side by side */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
            {/* Shared controls row */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'center',
                padding: 20,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.02)',
                fontFamily: FONT,
              }}
            >
              <ControlSelect
                label="Artist 1"
                value={selectedAId ?? ''}
                onChange={(v) => setSelectedAId(v || null)}
                options={heroArtists.map((a) => ({ value: a.id ?? a.name, label: a.name }))}
              />
              <ControlSelect
                label="Artist 2 (optional)"
                value={selectedBId ?? ''}
                onChange={(v) => setSelectedBId(v ? v : null)}
                options={[
                  { value: '', label: 'None' },
                  ...heroArtists.map((a) => ({ value: a.id ?? a.name, label: a.name })),
                ]}
              />
              <ControlDate label="Start" value={rangeStart} min={dataMin} max={dataMax} onChange={setRangeStart} />
              <ControlDate label="End" value={rangeEnd} min={dataMin} max={dataMax} onChange={setRangeEnd} />
              <ControlNumber
                label="Loop time (seconds)"
                value={loopSeconds}
                min={2}
                max={60}
                step={1}
                onChange={setLoopSeconds}
              />
            </div>

            {/* Both sources, same selection */}
            <div
              style={{
                display: 'flex',
                gap: 24,
                alignItems: 'flex-start',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Tile title="Wikipedia pageviews (daily)" aspect="9 / 16" maxWidth={500}>
                <CompareChart
                  artistA={wikiA}
                  artistB={wikiB}
                  windowStart={rangeStart ?? undefined}
                  windowEnd={rangeEnd ?? undefined}
                  loopMs={Math.max(loopSeconds, 1) * 1000}
                />
              </Tile>
              <Tile title="Google Trends (monthly)" aspect="9 / 16" maxWidth={500}>
                <CompareChart
                  artistA={trendsA}
                  artistB={trendsB}
                  windowStart={rangeStart ?? undefined}
                  windowEnd={rangeEnd ?? undefined}
                  loopMs={Math.max(loopSeconds, 1) * 1000}
                />
              </Tile>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
