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
const AXIS_YEAR = '#e4e4e7' // bright year labels along the timeline
const AXIS_GRID = '#48484f'
const AXIS_GRID_SOFT = 'rgba(255,255,255,0.08)' // solid (non-dashed) interior gridlines

// Default comparison on first load (Spotify ids, present in both data files).
const DEFAULT_A_ID = '3TVXtAsR1Inumwj472S9r4' // Drake
const DEFAULT_B_ID = '2YZyLoL8N0Wb9xBt1NhZWg' // Kendrick Lamar

// Max moving-average radius as a fraction of the series length (at smoothing 100).
const SMOOTH_MAX_FRAC = 0.08

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
  title?: string
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
      {title && (
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
      )}
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
  compact = false,
}: {
  artist: ArtistData | null
  drawingPrice: number | null
  fallbackPrice: number
  changeData: { percentChange: number; rawChange: number } | null
  chartColor: string
  valuePrefix?: string
  valueUnit?: string
  compact?: boolean
}) {
  const name = artist?.name ?? 'Loading…'
  const imageUrl = artist?.image_url
  // Compressed sizes for the fixed-canvas layout (the tape steals vertical room,
  // so the header tightens to keep the chart its size).
  const sz = compact
    ? { gap: 8, mb: 8, avatar: 44, nameGap: 5, name: 20, value: 28, unit: 16, chg: 13 }
    : { gap: 16, mb: 24, avatar: 64, nameGap: 10, name: 28, value: 40, unit: 24, chg: 16 }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: sz.gap,
        marginBottom: sz.mb,
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz.nameGap }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            style={{
              width: sz.avatar,
              height: sz.avatar,
              flexShrink: 0,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
            draggable={false}
          />
        ) : (
          <div
            style={{
              width: sz.avatar,
              height: sz.avatar,
              flexShrink: 0,
              borderRadius: '50%',
              backgroundColor: BORDER,
            }}
          />
        )}
        <h2
          style={{
            margin: 0,
            fontSize: sz.name,
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
          // Tabular digits so a rolling odometer never changes width — without
          // this (plus the reserved min-widths below) the header reflows every
          // frame and resizes the canvas, making the chart bob.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span
          style={{
            fontSize: sz.value,
            fontWeight: 600,
            color: WHITE,
            fontFamily: FONT,
            letterSpacing: '-0.02em',
            transition: 'color 0.6s ease',
            display: 'inline-block',
            minWidth: '3.5em',
            textAlign: 'center',
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
            fontSize: sz.unit,
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
                width={sz.chg}
                height={sz.chg}
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
                style={{
                  color: chartColor,
                  fontSize: sz.chg,
                  fontFamily: FONT,
                  display: 'inline-block',
                  minWidth: '4em',
                  textAlign: 'left',
                }}
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
              style={{
                color: chartColor,
                fontSize: sz.chg,
                fontFamily: FONT,
                display: 'inline-block',
                minWidth: '4em',
                textAlign: 'left',
              }}
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
  opts?: { start: number; end: number; smooth?: number; normalize?: boolean },
) {
  if (!data) return [] as { t: number; price: number }[]
  let pts = data
    .map((p) => ({ t: new Date(p.timestamp).getTime(), price: parseFloat(String(p.index)) }))
    .filter((p) => !isNaN(p.t) && !isNaN(p.price))
    .sort((a, b) => a.t - b.t)
  if (opts) {
    pts = pts.filter((p) => p.t >= opts.start && p.t <= opts.end)
  }
  // Smoothing: centred moving average whose window scales with the series
  // length, so one 0–100 control behaves consistently for the daily Wikipedia
  // and monthly Trends sources. Computed on the full windowed data BEFORE
  // downsampling (O(N) via a prefix sum); the window shrinks at the edges.
  if (opts?.smooth && opts.smooth > 0 && pts.length > 2) {
    const radius = Math.round((opts.smooth / 100) * SMOOTH_MAX_FRAC * pts.length)
    if (radius >= 1) {
      const n = pts.length
      const prefix = new Array<number>(n + 1)
      prefix[0] = 0
      for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + pts[i].price
      pts = pts.map((p, i) => {
        const lo = Math.max(0, i - radius)
        const hi = Math.min(n - 1, i + radius)
        return { t: p.t, price: (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1) }
      })
    }
  }
  // Normalise: min–max each series into 0–100 (own low → 0, high → 100) so two
  // artists of very different magnitude are shape-comparable on one axis.
  if (opts?.normalize && pts.length) {
    let lo = Infinity
    let hi = -Infinity
    for (const p of pts) {
      if (p.price < lo) lo = p.price
      if (p.price > hi) hi = p.price
    }
    const span = hi - lo
    pts = pts.map((p) => ({ t: p.t, price: span > 0 ? ((p.price - lo) / span) * 100 : 0 }))
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

// 'YYYY-MM' bucket key (UTC) for grouping daily values into months.
function monthKey(t: number): string {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Combined index: blend Wikipedia (daily) + Trends (monthly) into one monthly
// series over their overlapping date range. Wikipedia is stored per-artist
// normalised (each peaks at its own 100) and Trends is roster-scaled, so the two
// are NOT on a common cross-artist scale — the only coherent blend with the
// current data is to put BOTH on the same per-artist footing (scale each to its
// own overlap peak -> 100), then weighted-average. Result: a per-artist
// "consensus" popularity shape, 0..100.
function buildCombined(
  wiki: ArtistData | null,
  trends: ArtistData | null,
  wikiWeight = 0.5,
): ArtistData | null {
  if (!wiki && !trends) return null
  const meta = wiki ?? trends
  const parse = (d: ArtistData | null) =>
    (d?.data_points ?? [])
      .map((p) => ({ t: new Date(p.timestamp).getTime(), v: parseFloat(String(p.index)) }))
      .filter((p) => !isNaN(p.t) && !isNaN(p.v))
      .sort((a, b) => a.t - b.t)
  const wPts = parse(wiki)
  const tPts = parse(trends)

  // Monthly average of the daily Wikipedia series, keyed by 'YYYY-MM'.
  const wikiMonthly = new Map<string, { sum: number; n: number }>()
  for (const p of wPts) {
    const k = monthKey(p.t)
    const cur = wikiMonthly.get(k) ?? { sum: 0, n: 0 }
    cur.sum += p.v
    cur.n += 1
    wikiMonthly.set(k, cur)
  }
  const wikiAt = (t: number): number | null => {
    const e = wikiMonthly.get(monthKey(t))
    return e ? e.sum / e.n : null
  }

  // Grid of { month timestamp, wiki value, trends value }. Prefer the overlap
  // (Trends months that have Wikipedia coverage); fall back to whichever source
  // exists if the artist is missing from the other.
  let grid: { t: number; w: number | null; tr: number | null }[]
  if (wPts.length && tPts.length) {
    // Overlap by MONTH (not raw timestamp): a Trends month is blended iff
    // Wikipedia has that month, so a mid-month wiki start can't silently drop a
    // month, and wikiAt() always resolves for the months we keep.
    grid = tPts
      .filter((tp) => wikiMonthly.has(monthKey(tp.t)))
      .map((tp) => ({ t: tp.t, w: wikiAt(tp.t), tr: tp.v }))
  } else if (tPts.length) {
    grid = tPts.map((tp) => ({ t: tp.t, w: null, tr: tp.v }))
  } else {
    grid = Array.from(wikiMonthly.entries())
      .map(([k, e]) => {
        const [y, m] = k.split('-').map(Number)
        return { t: Date.UTC(y, m - 1, 1), w: e.sum / e.n, tr: null as number | null }
      })
      .sort((a, b) => a.t - b.t)
  }
  if (!grid.length) return null

  // Scale each source to its own peak over the grid (peak -> 100), preserving
  // zeros and proportions, so neither source's unit scale dominates the blend.
  let wMax = 0
  let trMax = 0
  for (const g of grid) {
    if (g.w != null && g.w > wMax) wMax = g.w
    if (g.tr != null && g.tr > trMax) trMax = g.tr
  }
  wMax = wMax || 1
  trMax = trMax || 1
  const wgt = Math.min(Math.max(wikiWeight, 0), 1)

  const data_points: DataPoint[] = grid.map((g) => {
    const wn = g.w == null ? null : (g.w / wMax) * 100
    const tn = g.tr == null ? null : (g.tr / trMax) * 100
    const val = wn != null && tn != null ? wgt * wn + (1 - wgt) * tn : (wn ?? tn ?? 0)
    return { timestamp: new Date(g.t).toISOString(), index: Math.round(val * 100) / 100 }
  })

  return {
    id: meta?.id,
    name: meta?.name ?? '',
    image_url: meta?.image_url ?? null,
    index_price: data_points[data_points.length - 1]?.index ?? 0,
    data_points,
  }
}

// Gamma-correct, chroma-weighted average colour of a LOADED image: linearise out
// of sRGB, weight each pixel by its chroma (bright/colourful pixels dominate),
// average in linear light, re-encode. Used as each artist's line colour.
function avgColorFromImage(img: HTMLImageElement): string | null {
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const toSrgb = (l: number) =>
    l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
  const maxDim = 1024
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const CHROMA_POW = 2
  let rl = 0
  let gl = 0
  let bl = 0
  let wSum = 0
  let rlFlat = 0
  let glFlat = 0
  let blFlat = 0
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue // skip near-transparent pixels
    const sr = data[i] / 255
    const sg = data[i + 1] / 255
    const sb = data[i + 2] / 255
    const chroma = Math.max(sr, sg, sb) - Math.min(sr, sg, sb)
    const lr = toLinear(sr)
    const lg = toLinear(sg)
    const lb = toLinear(sb)
    const cw = Math.pow(chroma, CHROMA_POW)
    rl += cw * lr
    gl += cw * lg
    bl += cw * lb
    wSum += cw
    rlFlat += lr
    glFlat += lg
    blFlat += lb
    n += 1
  }
  const useWeighted = wSum > 1e-3
  const denom = useWeighted ? wSum : n
  if (denom <= 0) return null
  const er = useWeighted ? rl : rlFlat
  const eg = useWeighted ? gl : glFlat
  const eb = useWeighted ? bl : blFlat
  return `rgb(${Math.round(toSrgb(er / denom) * 255)},${Math.round(toSrgb(eg / denom) * 255)},${Math.round(toSrgb(eb / denom) * 255)})`
}

// Loads an artist image once (CORS-safe) for BOTH its representative colour and
// for drawing the leading-edge avatar onto the chart canvas.
function useArtistImage(url: string | null | undefined): {
  color: string | null
  img: HTMLImageElement | null
} {
  const [res, setRes] = useState<{ color: string | null; img: HTMLImageElement | null }>({
    color: null,
    img: null,
  })
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      let color: string | null = null
      try {
        color = avgColorFromImage(img)
      } catch {
        // tainted / read failure — fall back to a neutral colour
      }
      setRes({ color, img })
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [url])
  return res
}

// ───────────────────────────────────────────────────────────────────────────
//   CompareChart — canvas-rendered, 60fps replay of two artists
// ───────────────────────────────────────────────────────────────────────────

type Pt = { t: number; price: number }
type HeadChg = { rawChange: number; percentChange: number } | null
type HeadData = { aP: number | null; aC: HeadChg; bP: number | null; bC: HeadChg }
type DrawState = {
  w: number
  h: number
  sA: Pt[]
  sB: Pt[]
  colorA: string
  colorB: string
  imgA: HTMLImageElement | null
  imgB: HTMLImageElement | null
  tStart: number
  tEnd: number
  gridStep: number
  hasB: boolean
}

const LEAD_R = 16 // leading-edge avatar radius

// Compact number for axis / value labels — keeps large raw values (pageviews
// can run to millions) from overflowing the narrow right gutter, while leaving
// small values (e.g. normalised 0–100) at full precision.
function fmtNum(v: number, smallDecimals: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return v.toFixed(smallDecimals)
}

// Pure imperative draw of one frame onto the 2D canvas (no React). Returns the
// header readouts so the caller can throttle the NumberFlow counter updates.
function drawCompareFrame(
  ctx: CanvasRenderingContext2D,
  st: DrawState,
  dpr: number,
  cursorT: number,
  scale: { loP: number; vRange: number; ready: boolean },
): HeadData {
  const { w, h, sA, sB, colorA, colorB, imgA, imgB, tStart, tEnd, gridStep, hasB } = st
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const PAD_T = AXIS_PAD_T
  const PAD_B = AXIS_PAD_B
  const chartAreaH = h - PAD_T - PAD_B
  const CHART_W = Math.max(0, w - AXIS_YW)
  const empty: HeadData = { aP: null, aC: null, bP: null, bC: null }
  if (chartAreaH <= 0 || CHART_W <= 0) return empty

  const fullSpan = Math.max(tEnd - tStart, 1)
  const minWin = Math.min(30 * 24 * 60 * 60 * 1000, fullSpan)
  const cursorTime = tStart + minWin + cursorT * (fullSpan - minWin)
  const winRange = Math.max(cursorTime - tStart, 1)

  const reveal = (s: Pt[]): Pt[] => {
    const out = s.filter((p) => p.t <= cursorTime)
    const lead = valueAt(s, cursorTime)
    if (lead != null && (!out.length || out[out.length - 1].t < cursorTime)) {
      out.push({ t: cursorTime, price: lead })
    }
    return out
  }
  const revA = reveal(sA)
  const revB = hasB ? reveal(sB) : []

  const rPrices = [...revA, ...revB].map((p) => p.price)
  const minP = rPrices.length ? Math.min(...rPrices) : 0
  const maxP = rPrices.length ? Math.max(...rPrices) : 1
  const pRange = maxP === minP ? 1 : maxP - minP
  const PAD = pRange * 0.08
  const targetLo = minP - PAD
  const targetV = pRange + 2 * PAD
  // Ease the y-scale toward its target so newly-revealed highs/lows don't pop
  // the whole line vertically — the main source of the "sudden" jolts. The
  // caller snaps `ready=false` at the loop restart for a clean reset.
  if (!scale.ready) {
    scale.loP = targetLo
    scale.vRange = targetV
    scale.ready = true
  } else {
    const k = 0.12
    scale.loP += (targetLo - scale.loP) * k
    scale.vRange += (targetV - scale.vRange) * k
  }
  const loP = scale.loP
  const vRange = scale.vRange

  const xOf = (t: number) => ((t - tStart) / winRange) * CHART_W
  const yOf = (price: number) => PAD_T + (1 - (price - loP) / vRange) * chartAreaH

  // round-number gridlines + right-edge price labels
  ctx.textBaseline = 'middle'
  ctx.font = `10px ${FONT}`
  if (rPrices.length && gridStep > 0 && vRange > 0) {
    const hiP = loP + vRange
    const first = Math.ceil(loP / gridStep) * gridStep
    for (let p = first, g = 0; p <= hiP + 1e-6 && g < 100; p += gridStep, g++) {
      const gy = Math.round(yOf(p)) + 0.5
      ctx.strokeStyle = AXIS_GRID_SOFT
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, gy)
      ctx.lineTo(CHART_W, gy)
      ctx.stroke()
      ctx.fillStyle = AXIS_MUTED
      ctx.textAlign = 'right'
      ctx.fillText(fmtNum(p, 2), w - 2, yOf(p))
    }
  }

  // solid L-axes (always present)
  ctx.strokeStyle = AXIS_GRID
  ctx.lineWidth = 1
  const baseY = Math.round(PAD_T + chartAreaH) + 0.5
  ctx.beginPath()
  ctx.moveTo(0, baseY)
  ctx.lineTo(CHART_W, baseY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0.5, PAD_T)
  ctx.lineTo(0.5, PAD_T + chartAreaH)
  ctx.stroke()

  const drawLine = (rev: Pt[], color: string) => {
    if (rev.length < 2) return
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < rev.length; i++) {
      const x = xOf(rev[i].t)
      const y = yOf(rev[i].price)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  drawLine(revA, colorA)
  if (hasB) drawLine(revB, colorB)

  // year ticks + labels: bright, evenly spaced at each year boundary, with a
  // small tick — a clean timeline like the reference. Thinned by how many years
  // are currently VISIBLE, so the growing window shows every year while zoomed
  // in and sparser labels as it zooms out.
  if (winRange > 1) {
    const y0 = new Date(tStart).getFullYear()
    const y1 = new Date(cursorTime).getFullYear()
    const visYears = y1 - y0 + 1
    const yStep = visYears <= 8 ? 1 : visYears <= 16 ? 2 : visYears <= 40 ? 5 : 10
    ctx.font = `12px ${FONT}`
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    for (let y = y0; y <= y1; y++) {
      if ((y - y0) % yStep !== 0) continue
      const boundary = Math.max(new Date(y, 0, 1).getTime(), tStart)
      const lx = xOf(boundary)
      if (lx < -0.5 || lx > CHART_W) continue
      const tx = Math.round(lx) + 0.5
      ctx.strokeStyle = AXIS_GRID
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(tx, baseY)
      ctx.lineTo(tx, baseY + 7)
      ctx.stroke()
      ctx.fillStyle = AXIS_YEAR
      ctx.fillText(String(y), Math.round(lx) + 5, baseY + 24)
    }
  }

  // leading-edge avatar + current-value label, per artist
  const drawLead = (rev: Pt[], color: string, img: HTMLImageElement | null) => {
    if (rev.length < 2) return
    const last = rev[rev.length - 1]
    const lx = xOf(last.t)
    const ly = yOf(last.price)
    const cx = lx + LEAD_R
    const cy = ly
    if (img) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, LEAD_R, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, cx - LEAD_R, cy - LEAD_R, LEAD_R * 2, LEAD_R * 2)
      ctx.restore()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(cx, cy, LEAD_R, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    const label = fmtNum(last.price, 1)
    ctx.font = `700 13px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    // The leading avatar is pinned to the plot's right edge, so the value tag
    // prefers the right of the avatar but would run off the canvas there. Fall
    // back to the left of the avatar (over the sparse plot) when there's no
    // room on the right; the BG halo keeps it legible either way.
    const labelW = ctx.measureText(label).width
    const rightX = cx + LEAD_R + 5
    let tx = rightX
    if (rightX + labelW <= w - 2) {
      ctx.textAlign = 'left'
    } else {
      ctx.textAlign = 'right'
      tx = cx - LEAD_R - 5
    }
    ctx.strokeStyle = BG
    ctx.strokeText(label, tx, cy)
    ctx.fillStyle = WHITE
    ctx.fillText(label, tx, cy)
  }
  drawLead(revA, colorA, imgA)
  if (hasB) drawLead(revB, colorB, imgB)

  const chg = (rev: Pt[]): HeadChg => {
    if (rev.length < 2) return null
    const f = rev[0].price
    const l = rev[rev.length - 1].price
    return { rawChange: l - f, percentChange: f > 0 ? ((l - f) / f) * 100 : 0 }
  }
  return {
    aP: revA.length ? revA[revA.length - 1].price : null,
    aC: chg(revA),
    bP: revB.length ? revB[revB.length - 1].price : null,
    bC: chg(revB),
  }
}

function CompareChart({
  artistA,
  artistB,
  height: heightProp = 620,
  windowStart,
  windowEnd,
  loopMs = 8200,
  normalised = false,
  smoothing = 0,
  compact = false,
}: {
  artistA: ArtistData | null
  artistB: ArtistData | null
  height?: number
  windowStart?: number
  windowEnd?: number
  loopMs?: number
  normalised?: boolean
  smoothing?: number
  compact?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const headTimeRef = useRef(0)
  const drawRef = useRef<DrawState | null>(null)
  const scaleRef = useRef({ loP: 0, vRange: 1, ready: false }) // eased y-scale (persists across frames)
  const lastTRef = useRef(0)
  const [size, setSize] = useState({ w: 700, h: heightProp })
  const [head, setHead] = useState<HeadData>({ aP: null, aC: null, bP: null, bC: null })

  // Measure the chart container (fills the card's leftover height).
  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Size the canvas backing store for the device pixel ratio (crisp output).
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
  }, [size.w, size.h])

  // --- data prep (memoised; NOT recomputed per frame) ---
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
  const tStart = Math.min(Math.max(windowStart ?? dataMin, dataMin), dataMax)
  const tEndClamped = Math.max(Math.min(windowEnd ?? dataMax, dataMax), dataMin)
  const tEnd = tEndClamped > tStart ? tEndClamped : dataMax
  const sA = useMemo(
    () => compareSeries(artistA?.data_points, { start: tStart, end: tEnd, smooth: smoothing, normalize: normalised }),
    [artistA, tStart, tEnd, smoothing, normalised],
  )
  const sB = useMemo(
    () => compareSeries(artistB?.data_points, { start: tStart, end: tEnd, smooth: smoothing, normalize: normalised }),
    [artistB, tStart, tEnd, smoothing, normalised],
  )
  const gridStep = useMemo(() => {
    const fp = [...sA, ...sB].map((p) => p.price)
    const lo = fp.length ? Math.min(...fp) : 0
    const hi = fp.length ? Math.max(...fp) : 1
    return niceStep(hi - lo || 1, 6)
  }, [sA, sB])

  const { color: colA, img: imgA } = useArtistImage(artistA?.image_url)
  const { color: colB, img: imgB } = useArtistImage(artistB?.image_url)
  const colorA = colA ?? '#9ca3af'
  const colorB = colB ?? '#9ca3af'

  // Publish the latest draw inputs to a ref the rAF loop reads (no per-frame React).
  useEffect(() => {
    drawRef.current = {
      w: size.w,
      h: size.h,
      sA,
      sB,
      colorA,
      colorB,
      imgA,
      imgB,
      tStart,
      tEnd,
      gridStep,
      hasB: !!artistB,
    }
  })

  // Restart the replay timing when the selection / speed changes.
  const dataKey = `${artistA?.name ?? ''}|${artistB?.name ?? ''}|${tStart}|${tEnd}|${loopMs}|${smoothing}|${normalised}`
  useEffect(() => {
    startRef.current = performance.now()
    scaleRef.current.ready = false // snap the scale to the new data
    lastTRef.current = 0
  }, [dataKey])

  // Single rAF loop: imperative canvas draw at 60fps; header values throttled.
  useEffect(() => {
    startRef.current = performance.now()
    const loop = (now: number) => {
      const st = drawRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && st) {
        const dpr = window.devicePixelRatio || 1
        const CYCLE = Math.max(loopMs, 1000)
        const GROW = CYCLE * 0.85
        const phase = (now - startRef.current) % CYCLE
        const rawT = Math.min(phase / GROW, 1)
        const cursorT = rawT * rawT * (3 - 2 * rawT) // smoothstep ease-in-out
        if (cursorT < lastTRef.current - 1e-3) scaleRef.current.ready = false // loop restart -> snap
        lastTRef.current = cursorT
        const hd = drawCompareFrame(ctx, st, dpr, cursorT, scaleRef.current)
        if (now - headTimeRef.current > 180) {
          headTimeRef.current = now
          setHead(hd)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [loopMs])

  return (
    <div style={{ width: '100%', maxWidth: 760, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: compact ? 16 : 24, justifyContent: 'center' }}>
        <div style={{ flex: artistB ? '1 1 0' : '0 1 auto', minWidth: 0 }}>
          <ChartArtistHeader
            artist={artistA}
            drawingPrice={head.aP}
            fallbackPrice={artistA?.index_price ?? 0}
            changeData={head.aC}
            chartColor={colorA}
            valuePrefix=""
            valueUnit="pts"
            compact={compact}
          />
        </div>
        {artistB && (
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <ChartArtistHeader
              artist={artistB}
              drawingPrice={head.bP}
              fallbackPrice={artistB?.index_price ?? 0}
              changeData={head.bC}
              chartColor={colorB}
              valuePrefix=""
              valueUnit="pts"
              compact={compact}
            />
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ width: '100%', flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
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

function ControlToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={CONTROL_LABEL_STYLE}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          ...CONTROL_INPUT_STYLE,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 38,
          background: checked ? 'rgba(4,223,157,0.12)' : CONTROL_INPUT_STYLE.background,
          borderColor: checked ? POSITIVE : BORDER,
          color: checked ? WHITE : SEC,
        }}
      >
        <span
          style={{
            width: 34,
            height: 18,
            borderRadius: 999,
            background: checked ? POSITIVE : 'rgba(255,255,255,0.15)',
            position: 'relative',
            transition: 'background 0.15s ease',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: checked ? 18 : 2,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s ease',
            }}
          />
        </span>
        {checked ? 'On' : 'Off'}
      </button>
    </label>
  )
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={CONTROL_LABEL_STYLE}>{label}</span>
      <div style={{ height: 38, display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ accentColor: POSITIVE, width: 150, cursor: 'pointer' }}
        />
      </div>
    </label>
  )
}

function ControlSegmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <span style={CONTROL_LABEL_STYLE}>{label}</span>
      <div
        style={{
          display: 'inline-flex',
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontFamily: FONT,
                cursor: 'pointer',
                border: 'none',
                background: active ? POSITIVE : 'transparent',
                color: active ? '#0a0a0a' : SEC,
                fontWeight: active ? 600 : 400,
                whiteSpace: 'nowrap',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
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
  const [loopSeconds, setLoopSeconds] = useState(35) // full-loop target duration
  const [normalised, setNormalised] = useState(false) // min–max each series to 0–100
  const [smoothing, setSmoothing] = useState(0) // 0–100 moving-average strength
  const [source, setSource] = useState<'wikipedia' | 'combined' | 'trends'>('combined')
  const [tapeText, setTapeText] = useState('')

  // Defaults once the snapshot loads: Drake vs Kendrick Lamar, full date range.
  // (undefined = not yet initialised; null for artist B = user picked "None".)
  useEffect(() => {
    if (!heroArtists.length) return
    const has = (id: string) => heroArtists.some((a) => a.id === id)
    const defA = has(DEFAULT_A_ID) ? DEFAULT_A_ID : heroArtists[0]?.id ?? null
    const defB = has(DEFAULT_B_ID) ? DEFAULT_B_ID : heroArtists[1]?.id ?? null
    setSelectedAId((cur) => cur ?? defA)
    setSelectedBId((cur) => (cur === undefined ? defB : cur))
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
  const combinedA = useMemo(() => buildCombined(wikiA, trendsA), [wikiA, trendsA])
  const combinedB = useMemo(() => buildCombined(wikiB, trendsB), [wikiB, trendsB])
  const sourceOptions = {
    wikipedia: { a: wikiA, b: wikiB },
    combined: { a: combinedA, b: combinedB },
    trends: { a: trendsA, b: trendsB },
  }
  const current = sourceOptions[source]
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
              <ControlToggle label="Normalise (0–100)" checked={normalised} onChange={setNormalised} />
              <ControlSlider
                label={`Smoothing${smoothing ? ` · ${smoothing}%` : ''}`}
                value={smoothing}
                min={0}
                max={100}
                step={5}
                onChange={setSmoothing}
              />
            </div>

            {/* One selectable source at a time */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 20,
              }}
            >
              <ControlSegmented
                label="Source"
                value={source}
                onChange={(v) => setSource(v as 'wikipedia' | 'combined' | 'trends')}
                options={[
                  { value: 'wikipedia', label: 'Wikipedia' },
                  { value: 'combined', label: 'Combined' },
                  { value: 'trends', label: 'Google Trends' },
                ]}
              />
              {/* Fixed 1080x1920 canvas: white tape (300px) at the top, chart
                  below. The artist header is compressed so the chart keeps its
                  size within the fixed canvas. */}
              <div
                style={{
                  width: '100%',
                  maxWidth: 440,
                  aspectRatio: '1080 / 1920',
                  border: `2px solid ${WHITE}`,
                  boxSizing: 'border-box',
                  background: BG,
                  display: 'flex',
                  flexDirection: 'column',
                  margin: '0 auto',
                }}
              >
                {/* White title tape — 1080x300 band (15.625% of the canvas),
                    full-bleed, with centred editable black Geist text. */}
                <div
                  style={{
                    width: '100%',
                    height: '15.625%',
                    flexShrink: 0,
                    background: WHITE,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    containerType: 'inline-size',
                  }}
                >
                  <input
                    type="text"
                    value={tapeText}
                    onChange={(e) => setTapeText(e.target.value)}
                    placeholder="Type a title…"
                    style={{
                      width: '92%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      textAlign: 'center',
                      color: '#000000',
                      fontFamily: 'var(--font-geist-sans)',
                      fontWeight: 600,
                      fontSize: 'clamp(14px, 7cqw, 96px)',
                      padding: 0,
                    }}
                  />
                </div>
                {/* Chart area — remaining 84.375%, padded. */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    padding: 32,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <CompareChart
                    artistA={current.a}
                    artistB={current.b}
                    windowStart={rangeStart ?? undefined}
                    windowEnd={rangeEnd ?? undefined}
                    loopMs={Math.max(loopSeconds, 1) * 1000}
                    normalised={normalised}
                    smoothing={smoothing}
                    compact
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
