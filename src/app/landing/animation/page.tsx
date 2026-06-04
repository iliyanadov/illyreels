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
        </div>
      </div>
    </div>
  )
}
