import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Aggregates } from '../lib/aggregate'
import { Card } from './ui'
import { useFormat } from '../lib/format'

export function BalanceTrend({ data }: { data: Aggregates }) {
  const { full, short } = useFormat()
  if (data.balance.length < 2) return null

  const points = data.balance.map((p) => ({ ...p, t: +new Date(p.date) }))
  const lowest = points.reduce((a, p) => (p.balance < a.balance ? p : a))
  const highest = points.reduce((a, p) => (p.balance > a.balance ? p : a))
  const negatives = points.filter((p) => p.balance < 0).length

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
      <div className="h-[300px] w-full">
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-p3)" stopOpacity={0.42} />
                <stop offset="100%" stopColor="var(--color-p3)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: 'var(--color-muted)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tickFormatter={(d: string) => d.slice(0, 7)}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--color-muted)' }}
              tickLine={false}
              axisLine={false}
              width={62}
              tickFormatter={(v: number) => short(v)}
            />
            <Tooltip
              contentStyle={{
                background: '#1b1a18',
                border: 'none',
                borderRadius: 8,
                fontSize: 12.5,
                color: '#fff',
              }}
              labelStyle={{ color: '#cfcbc4' }}
              formatter={(v) => [full(Number(v)), 'Balance']}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--color-p5)"
              strokeWidth={1.8}
              fill="url(#balFill)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
