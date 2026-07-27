import type { Aggregates } from '../lib/aggregate'
import type { Category } from '../lib/types'
import { Card } from './ui'
import { useFormat } from '../lib/format'

const LABEL: Record<Category, string> = {
  transfer: 'Transfers out',
  card: 'Card & merchant',
  airtime: 'Airtime',
  data: 'Mobile data',
  bills: 'Bills & utilities',
  loan: 'Loan repayment',
  cash: 'Cash withdrawal',
  other: 'Other',
}

const FILL: Record<Category, string> = {
  transfer: 'bg-p5',
  card: 'bg-p4',
  airtime: 'bg-p3',
  data: 'bg-p2',
  bills: 'bg-p1',
  loan: 'bg-g2',
  cash: 'bg-g1',
  other: 'bg-[#c9c5bc]',
}

function Ranked({ title, rows, tone }: { title: string; rows: Aggregates['payees']; tone: string }) {
  const { full } = useFormat()
  const max = rows[0]?.amount ?? 1
  return (
    <div>
      <h3 className="mb-3 text-[12px] uppercase tracking-[0.14em] text-muted">{title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.name} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] text-ink" title={r.name}>
                {r.name}
              </div>
              <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-[#eceae4]">
                <div
                  className={`h-full rounded-full ${tone}`}
                  style={{ width: `${Math.max(3, (r.amount / max) * 100)}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13.5px] font-semibold text-ink">{full(r.amount)}</div>
              <div className="text-[11.5px] text-muted">{r.txns} txn</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Breakdown({ data }: { data: Aggregates }) {
  const { full } = useFormat()
  const total = data.categories.reduce((s, c) => s + c.amount, 0) || 1

  return (
    <Card
      title="Where it goes"
      subtitle="Outflow split by type, then ranked by who was on the other side"
    >
      <div className="mb-8">
        <div className="flex h-4 overflow-hidden rounded-full">
          {data.categories.map((c) => (
            <div
              key={c.category}
              className={FILL[c.category]}
              style={{ width: `${(c.amount / total) * 100}%` }}
              title={`${LABEL[c.category]} — ${full(c.amount)}`}
            />
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2.5">
          {data.categories.map((c) => (
            <li key={c.category} className="flex items-center gap-2 text-[13px]">
              <i className={`size-2.5 rounded-[3px] ${FILL[c.category]}`} />
              <span className="text-body">{LABEL[c.category]}</span>
              <span className="font-semibold text-ink">{full(c.amount)}</span>
              <span className="text-muted">{Math.round((c.amount / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-10 border-t border-line pt-7 md:grid-cols-2">
        <Ranked title="Biggest recipients" rows={data.payees} tone="bg-p4" />
        <Ranked title="Biggest senders" rows={data.payers} tone="bg-g2" />
      </div>
    </Card>
  )
}
