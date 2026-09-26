import { useRef, useState } from 'react'
import type { Aggregates } from '../lib/aggregate'
import { MONTHS } from '../lib/aggregate'
import { Card, Tooltip } from './ui'
import { useFormat } from '../lib/format'

const W = 920
const H = 320
const L = 70
const R = 16
const T = 14
const B = 36

const DAY = 86_400_000

/**
 * A clean 1/2/2.5/5 x 10^n axis covering the data. Zero is always included,
 * so a small swing on a large balance isn't drawn as a cliff, and an overdrawn
 * account extends the axis below zero rather than being clipped.
 */
function niceRange(min: number, max: number) {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  const raw = (hi - lo || 1) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)! // always resolves
  return { bottom: Math.floor(lo / step) * step, top: Math.ceil(hi / step) * step, step }
}

/** First-of-month ticks, thinned so labels never collide. */
function monthTicks(first: number, last: number, maxTicks = 8) {
  const start = new Date(first)
  const months: number[] = []
  for (
    let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    +d <= last;
    d.setUTCMonth(d.getUTCMonth() + 1)
  )
    months.push(+d)
  const every = Math.max(1, Math.ceil(months.length / maxTicks))
  return months.filter((_, i) => i % every === 0)
}

/*
 * Hand-drawn like every other chart here. It used to be the only Recharts
 * chart, and Recharts plus its dependencies were over half the app's bundle.
 */
export function BalanceTrend({ data }: { data: Aggregates }) {
  const { full, short, symbol } = useFormat()
  const svg = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null)
  if (data.balance.length < 2) return null

  const points = data.balance.map((p) => ({ ...p, t: Date.parse(p.date) }))
  const lowest = points.reduce((a, p) => (p.balance < a.balance ? p : a))
  const highest = points.reduce((a, p) => (p.balance > a.balance ? p : a))
  const negatives = points.filter((p) => p.balance < 0).length

  const first = points[0].t
  const last = points[points.length - 1].t
  const { bottom, top, step } = niceRange(lowest.balance, highest.balance)
  const plotW = W - L - R
  const plotH = H - T - B
  const x = (t: number) => L + ((t - first) / (last - first || DAY)) * plotW
  const y = (v: number) => T + plotH - ((v - bottom) / (top - bottom)) * plotH

  const ticks: number[] = []
  for (let v = bottom; v <= top + step * 1e-6; v += step) ticks.push(v)

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.balance).toFixed(1)}`).join('')
  const base = y(Math.max(bottom, 0))
  const area = `${line}L${x(last).toFixed(1)},${base}L${x(first).toFixed(1)},${base}Z`

  /** Nearest day to the pointer, found by binary search over the sorted dates. */
  const track = (e: React.MouseEvent) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return
    const t = first + (((e.clientX - box.left) / box.width) * W - L) / plotW * (last - first)
    let lo = 0
    let hi = points.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (points[mid].t < t) lo = mid
      else hi = mid
    }
    const i = Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? lo : hi
    setHover({ x: e.clientX, y: e.clientY, i })
  }

  const hovered = hover ? points[hover.i] : undefined

  return (
    <Card
      title="Balance trend"
      subtitle="End-of-day balance on the account that reports one"
      csv={() => [
        ['Date', 'Balance'],
        ...data.balance.map((p) => [p.date, p.balance.toFixed(2)]),
      ]}
      footer={
        <>
          Peak <b className="text-ink">{full(highest.balance)}</b> on {highest.date} · low{' '}
          <b className="text-ink">{full(lowest.balance)}</b> on {lowest.date}
          {negatives > 0 && <> · {negatives} day(s) in the red</>}
        </>
      }
    >
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Balance from ${points[0].date} to ${points[points.length - 1].date}, between ${full(lowest.balance)} and ${full(highest.balance)}`}
        onMouseMove={track}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-p3)" stopOpacity={0.42} />
            <stop offset="100%" stopColor="var(--color-p3)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={L}
              x2={W - R}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 && bottom < 0 ? 'var(--color-p3)' : 'var(--color-line)'}
              strokeWidth={1}
            />
            <text x={L - 12} y={y(v) + 4} textAnchor="end" className="fill-muted text-[20px] sm:text-[12px]">
              {v === 0 ? `${symbol}0` : short(v)}
            </text>
          </g>
        ))}

        {monthTicks(first, last).map((t) => {
          const d = new Date(t)
          return (
            <text
              key={t}
              x={x(t)}
              y={H - 10}
              textAnchor="middle"
              className="fill-muted text-[20px] sm:text-[12px]"
            >
              {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}
            </text>
          )
        })}

        <path d={area} fill="url(#balFill)" />
        <path d={line} fill="none" stroke="var(--color-p5)" strokeWidth={1.8} strokeLinejoin="round" />

        {hovered && (
          <g data-export-ignore>
            <line
              x1={x(hovered.t)}
              x2={x(hovered.t)}
              y1={T}
              y2={T + plotH}
              stroke="var(--color-p3)"
              strokeDasharray="3 3"
            />
            <circle cx={x(hovered.t)} cy={y(hovered.balance)} r={4} fill="var(--color-p5)" stroke="var(--color-card)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hover && hovered && (
        <Tooltip x={hover.x} y={hover.y}>
          <b>{hovered.date}</b>
          <br />
          {full(hovered.balance)}
        </Tooltip>
      )}
    </Card>
  )
}
