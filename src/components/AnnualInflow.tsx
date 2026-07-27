import type { Aggregates } from '../lib/aggregate'
import { Card } from './ui'
import { useFormat } from '../lib/format'

const W = 920
const H = 470
const L = 98
const R = 20
const T = 40
const B = 68

/** Round the axis up to a clean 1/2/5 x 10^n step with 4–5 gridlines. */
function niceAxis(max: number) {
  if (max <= 0) return { top: 1, step: 1 }
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)! // always resolves
  return { top: Math.ceil(max / step) * step, step }
}

export function AnnualInflow({ data }: { data: Aggregates }) {
  const { full, short, symbol } = useFormat()
  const rows = data.inflow
  if (!rows.length) return null

  const { top, step } = niceAxis(Math.max(...rows.map((r) => r.total)))
  const plotW = W - L - R
  const plotH = H - T - B
  const y = (v: number) => T + plotH - (v / top) * plotH
  const slot = plotW / rows.length
  const bw = Math.min(110, slot * 0.42)

  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v)

  const best = rows.reduce((a, r) => (r.total > a.total ? r : a))

  return (
    <Card
      title="Annual inflow"
      subtitle="Total money received in each calendar year · partial years show available months"
      csv={() => [
        ['Year', 'Inflow', 'Months covered'],
        ...rows.map((r) => [r.year, r.total.toFixed(2), r.months]),
      ]}
      footer={
        <>
          <b className="text-ink">{full(data.totals.inflow)}</b> received in total · best year{' '}
          <b className="text-ink">{best.year}</b> at {full(best.total)}
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="inflowBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-g1)" />
            <stop offset="55%" stopColor="var(--color-g2)" />
            <stop offset="100%" stopColor="var(--color-g3)" />
          </linearGradient>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text
              x={L - 16}
              y={y(v) + 5}
              textAnchor="end"
              className="fill-muted text-[22px] sm:text-[14px]"
            >
              {v === 0 ? `${symbol}0` : short(v)}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const cx = L + slot * (i + 0.5)
          const t = y(r.total)
          const h = Math.max(T + plotH - t, 4)
          const rr = Math.min(7, h / 2)
          const x0 = cx - bw / 2
          const x1 = cx + bw / 2
          const base = T + plotH
          return (
            <g key={r.year}>
              <path
                fill="url(#inflowBar)"
                d={`M${x0},${base} L${x0},${t + rr} Q${x0},${t} ${x0 + rr},${t} L${x1 - rr},${t} Q${x1},${t} ${x1},${t + rr} L${x1},${base} Z`}
              >
                <title>{`${r.year}: ${full(r.total)}`}</title>
              </path>
              <text
                x={cx}
                y={t - 14}
                textAnchor="middle"
                className="fill-ink text-[24px] sm:text-[16px]"
              >
                {short(r.total)}
              </text>
              <text
                x={cx}
                y={base + 30}
                textAnchor="middle"
                className="fill-body text-[24px] sm:text-[16px]"
              >
                {r.year}
              </text>
              {r.months < 12 && (
                <text
                  x={cx}
                  y={base + 52}
                  textAnchor="middle"
                  className="fill-muted text-[20px] sm:text-[13.5px]"
                >
                  {r.months} mo
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </Card>
  )
}
