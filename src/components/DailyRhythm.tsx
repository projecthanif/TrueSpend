import { useMemo, useState } from 'react'
import { MONTHS, type Aggregates } from '../lib/aggregate'
import { Card, Legend, Tabs, Tooltip } from './ui'
import { useFormat } from '../lib/format'

const RAMP = ['bg-p0', 'bg-p1', 'bg-p2', 'bg-p3', 'bg-p4', 'bg-p5']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Six shade buckets from the data itself, so a quiet year and a heavy year are
 * still readable. Quantiles beat fixed naira thresholds here because spending
 * scale differs wildly between accounts.
 */
function useBins(amounts: number[]) {
  return useMemo(() => {
    const sorted = amounts.filter((a) => a > 0).sort((a, b) => a - b)
    if (!sorted.length) return [0, 1, 2, 3, 4, 5]
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    return [0, q(0.2), q(0.4), q(0.6), q(0.8), q(0.93)]
  }, [amounts])
}

export function DailyRhythm({ data }: { data: Aggregates }) {
  const { full } = useFormat()
  const years = useMemo(() => {
    const s = new Set<number>()
    for (const d of data.daily.keys()) s.add(Number(d.slice(0, 4)))
    return [...s].sort()
  }, [data])

  const [year, setYear] = useState(years[years.length - 1])
  const [hover, setHover] = useState<{ x: number; y: number; date: string } | null>(null)

  const bins = useBins([...data.daily.values()].map((c) => c.amount))
  const level = (v: number) => {
    let l = 0
    for (let i = bins.length - 1; i >= 0; i--)
      if (v > bins[i]) {
        l = i
        break
      }
    return l
  }

  const { weeks, cells } = useMemo(() => {
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31))
    const first = new Date(start)
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7)) // back to Monday
    const span = Math.round((+end - +first) / 86_400_000) + 1
    const w = Math.ceil(span / 7)
    const list: Date[] = []
    for (let i = 0; i < w * 7; i++) {
      const d = new Date(first)
      d.setUTCDate(first.getUTCDate() + i)
      list.push(d)
    }
    return { weeks: w, cells: list }
  }, [year])

  const headers = useMemo(() => {
    const out: (string | null)[] = Array(weeks).fill(null)
    let seen = -1
    for (let w = 0; w < weeks; w++) {
      const d = cells[w * 7 + 3] // mid-week decides the column's month
      if (d.getUTCFullYear() === year && d.getUTCMonth() !== seen) {
        seen = d.getUTCMonth()
        out[w] = MONTHS[seen]
      }
    }
    return out
  }, [cells, weeks, year])

  const yearCells = [...data.daily.values()].filter((c) => c.date.startsWith(String(year)))
  const total = yearCells.reduce((s, c) => s + c.amount, 0)
  const txns = yearCells.reduce((s, c) => s + c.txns, 0)
  const peak = yearCells.reduce((a, c) => (c.amount > a.amount ? c : a), yearCells[0])
  const hovered = hover ? data.daily.get(hover.date) : undefined

  return (
    <Card
      title="Spending rhythm"
      subtitle="Every day of the year, shaded by how much left your accounts"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>
            <b className="text-ink">{full(total)}</b> across{' '}
            <b className="text-ink">{yearCells.length}</b> active days ·{' '}
            <b className="text-ink">{txns}</b> transactions
            {peak && (
              <>
                {' '}
                · busiest <b className="text-ink">{peak.date}</b> ({full(peak.amount)})
              </>
            )}
          </span>
          <Legend ramp={RAMP} />
        </div>
      }
    >
      <div className="mb-6">
        <Tabs items={years} value={year} onChange={setYear} />
      </div>

      <div className="scroll-thin overflow-x-auto pb-1.5">
        <table className="border-separate border-spacing-1" style={{ minWidth: weeks * 19 + 44 }}>
          <thead>
            <tr>
              <th className="w-9" />
              {headers.map((h, i) => (
                <th key={i} className="pb-1.5 text-left text-[13px] font-normal text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, r) => (
              <tr key={day}>
                <td className="pr-2 text-right align-middle text-[12.5px] text-muted">
                  {r % 2 === 0 ? day : ''}
                </td>
                {Array.from({ length: weeks }, (_, w) => {
                  const d = cells[w * 7 + r]
                  if (d.getUTCFullYear() !== year) return <td key={w} className="size-[15px]" />

                  const key = iso(d)
                  const outside = key < data.coverage.first || key > data.coverage.last
                  const cell = data.daily.get(key)
                  const cls = outside ? 'bg-empty' : RAMP[level(cell?.amount ?? 0)]

                  return (
                    <td
                      key={w}
                      className={`size-[15px] rounded-[4.5px] ${cls} ${outside ? '' : 'cursor-pointer hover:outline hover:outline-[1.5px] hover:outline-offset-[1px] hover:outline-p5'}`}
                      onMouseEnter={
                        outside
                          ? undefined
                          : (e) => setHover({ x: e.clientX, y: e.clientY, date: key })
                      }
                      onMouseMove={
                        outside ? undefined : (e) => setHover({ x: e.clientX, y: e.clientY, date: key })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <b>{full(hovered?.amount ?? 0)}</b> · {hovered?.txns ?? 0} txn
          <br />
          {new Date(hover.date + 'T00:00:00Z').toUTCString().slice(0, 16)}
        </Tooltip>
      )}
    </Card>
  )
}
