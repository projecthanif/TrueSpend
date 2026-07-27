import { useMemo, useState } from 'react'
import { MONTHS, type Aggregates } from '../lib/aggregate'
import { Card, Legend, Tooltip } from './ui'
import { useFormat } from '../lib/format'

const RAMP = ['bg-p0', 'bg-p1', 'bg-p2', 'bg-p3', 'bg-p4', 'bg-p5']
const INK = ['text-[#4b3a6b]', 'text-[#4b3a6b]', 'text-[#4b3a6b]', 'text-white', 'text-white', 'text-white']

export function MonthlyRhythm({ data }: { data: Aggregates }) {
  const { full, short } = useFormat()
  const [hover, setHover] = useState<{ x: number; y: number; key: string } | null>(null)

  const byKey = useMemo(() => new Map(data.monthly.map((m) => [m.key, m])), [data])
  const years = useMemo(() => [...new Set(data.monthly.map((m) => m.year))].sort(), [data])

  const bins = useMemo(() => {
    const sorted = data.monthly.map((m) => m.amount).sort((a, b) => a - b)
    if (!sorted.length) return [0, 1, 2, 3, 4, 5]
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    return [0, q(0.15), q(0.35), q(0.55), q(0.75), q(0.9)]
  }, [data])

  const level = (v: number) => {
    let l = 0
    for (let i = bins.length - 1; i >= 0; i--)
      if (v > bins[i]) {
        l = i
        break
      }
    return l
  }

  // "Full" months only, so a 2-day stub month can't drag the average down.
  const fullMonths = data.monthly.filter((m) => m.activeDays >= 25)
  const avg = fullMonths.length
    ? fullMonths.reduce((s, m) => s + m.amount, 0) / fullMonths.length
    : 0
  const peak = data.monthly.reduce((a, m) => (m.amount > a.amount ? m : a), data.monthly[0])
  const label = (k: string) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`
  const hovered = hover ? byKey.get(hover.key) : undefined

  return (
    <Card
      title="Monthly rhythm"
      subtitle="Every month side by side · shade and label show total outflow"
      csv={() => [
        ['Month', 'Spent', 'Transactions', 'Active days'],
        ...data.monthly.map((m) => [m.key, m.amount.toFixed(2), m.txns, m.activeDays]),
      ]}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>
            Average full month <b className="text-ink">{full(avg)}</b>
            {peak && (
              <>
                {' '}
                · heaviest <b className="text-ink">{label(peak.key)}</b> ({full(peak.amount)})
              </>
            )}
          </span>
          <Legend ramp={RAMP} />
        </div>
      }
    >
      <div className="scroll-thin overflow-x-auto pb-1.5">
        <table className="w-full border-separate border-spacing-1.5" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th className="w-14" />
              {MONTHS.map((m) => (
                <th key={m} className="pb-1 text-[13px] font-normal text-muted">
                  {m}
                </th>
              ))}
              <th className="pb-1 text-[13px] font-normal text-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const rowTotal = data.monthly
                .filter((m) => m.year === y)
                .reduce((s, m) => s + m.amount, 0)
              return (
                <tr key={y}>
                  <td className="pr-2.5 text-right text-[16px] font-semibold text-body">{y}</td>
                  {MONTHS.map((_, mi) => {
                    const key = `${y}-${String(mi + 1).padStart(2, '0')}`
                    const cell = byKey.get(key)
                    if (!cell) return <td key={key} className="h-[62px] rounded-[11px] bg-empty" />
                    const l = level(cell.amount)
                    return (
                      <td
                        key={key}
                        className={`h-[62px] cursor-pointer rounded-[11px] text-center align-middle text-[13px] font-semibold transition hover:scale-105 ${RAMP[l]} ${INK[l]}`}
                        onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, key })}
                        onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, key })}
                        onMouseLeave={() => setHover(null)}
                      >
                        {short(cell.amount)}
                        <small className="mt-0.5 block text-[10.5px] font-normal opacity-70">
                          {cell.txns} txn
                        </small>
                      </td>
                    )
                  })}
                  <td className="text-center text-[13.5px] font-semibold text-body">
                    {short(rowTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hover && hovered && (
        <Tooltip x={hover.x} y={hover.y}>
          <b>{label(hovered.key)}</b>
          <br />
          {full(hovered.amount)}
          <br />
          {hovered.txns} transactions · {hovered.activeDays} active days
        </Tooltip>
      )}
    </Card>
  )
}
