import { useMemo, useState } from 'react'
import type { Classified } from '../lib/classify'
import type { Category, Kind, Overrides, Patch, Txn } from '../lib/types'
import { useFormat } from '../lib/format'
import { CATEGORY_LABEL, KIND_OPTION } from '../lib/labels'
import { Card } from './ui'

type Filter = 'all' | 'counted' | 'excluded' | 'overridden'

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['counted', 'Counted'],
  ['excluded', 'Excluded'],
  ['overridden', 'Changed by you'],
]

const PAGE = 50

const select =
  'cursor-pointer border border-line bg-card px-2 py-1 text-[12px] text-ink outline-none transition-colors hover:border-p3 focus:border-ink'

/**
 * Every row behind the charts, with a way to correct any of them.
 *
 * The classifier is heuristic, so a dashboard with no way to fix a single
 * misread row is only as trustworthy as its worst guess. A correction can be
 * made for one row, or promoted to a rule for everything from that
 * counterparty — which is usually what's wanted ("this person is my sibling,
 * not income").
 */
export function Transactions({
  data,
  overrides,
  onChange,
}: {
  data: Classified
  overrides: Overrides
  onChange: (next: Overrides) => void
}) {
  const { full } = useFormat()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE)

  const fileOf = useMemo(
    () => new Map(data.statements.map((s) => [s.id, s.fileName])),
    [data.statements],
  )
  const perCounterparty = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of data.txns) m.set(t.counterparty, (m.get(t.counterparty) ?? 0) + 1)
    return m
  }, [data.txns])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.txns
      .filter((t) => {
        if (filter === 'counted' && t.kind !== 'external') return false
        if (filter === 'excluded' && t.kind === 'external') return false
        if (filter === 'overridden' && !data.overridden.has(t.id)) return false
        if (!q) return true
        return (
          t.description.toLowerCase().includes(q) ||
          t.counterparty.toLowerCase().includes(q) ||
          t.date.includes(q) ||
          t.amount.toFixed(2).includes(q)
        )
      })
      .reverse() // newest first
  }, [data.txns, data.overridden, query, filter])

  const patchTxn = (t: Txn, patch: Patch) =>
    onChange({
      ...overrides,
      byTxn: { ...overrides.byTxn, [t.id]: { ...overrides.byTxn[t.id], ...patch } },
    })

  /** Turn one row's correction into a rule for its counterparty. */
  const promote = (t: Txn) => {
    const { [t.id]: patch, ...rest } = overrides.byTxn
    onChange({
      byTxn: rest,
      byCounterparty: {
        ...overrides.byCounterparty,
        [t.counterparty]: { ...overrides.byCounterparty[t.counterparty], ...patch },
      },
    })
  }

  const reset = (t: Txn) => {
    const { [t.id]: _, ...byTxn } = overrides.byTxn
    const { [t.counterparty]: __, ...byCounterparty } = overrides.byCounterparty
    onChange({ byTxn, byCounterparty })
  }

  const multiAccount = data.statements.length > 1

  return (
    <Card
      title="Every transaction"
      subtitle="The rows behind every chart. If one is classed wrongly, change it here and the totals update."
      csv={() => [
        ['Date', 'Account', 'Direction', 'Amount', 'Counterparty', 'Description', 'Kind', 'Category', 'Changed by you'],
        ...rows.map((t) => [
          t.date,
          fileOf.get(t.sourceId) ?? '',
          t.direction,
          t.amount.toFixed(2),
          t.counterparty,
          t.description,
          KIND_OPTION[t.kind],
          t.direction === 'out' ? CATEGORY_LABEL[t.category] : '',
          data.overridden.has(t.id) ? 'yes' : '',
        ]),
      ]}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex border-b border-line" role="tablist">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => {
                setFilter(key)
                setShown(PAGE)
              }}
              className={
                'cursor-pointer border-b-2 px-3 py-2 text-[13px] transition-colors ' +
                (filter === key
                  ? 'border-ink font-semibold text-ink'
                  : 'border-transparent font-medium text-muted hover:text-body')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShown(PAGE)
          }}
          placeholder="Search name, description, amount…"
          aria-label="Search transactions"
          className="w-full border-b border-line bg-transparent px-0 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus:border-ink sm:w-72"
        />
      </div>

      <p className="mb-3 text-[12px] text-muted">
        {rows.length.toLocaleString()} transaction{rows.length === 1 ? '' : 's'}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.14em] text-muted">
              <th className="py-2.5 pr-4 font-semibold">Date</th>
              <th className="py-2.5 pr-4 font-semibold">Who</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Amount</th>
              <th className="py-2.5 pr-4 font-semibold">Kind</th>
              <th className="py-2.5 pr-4 font-semibold">Category</th>
              <th className="py-2.5 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((t) => {
              const changed = data.overridden.has(t.id)
              const ownPatch = overrides.byTxn[t.id]
              const others = (perCounterparty.get(t.counterparty) ?? 1) - 1
              const dim = t.kind !== 'external'
              return (
                <tr key={t.id} className="border-b border-line align-top">
                  <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-body">{t.date}</td>
                  <td className="max-w-[340px] py-3 pr-4">
                    <div className={'truncate font-medium ' + (dim ? 'text-muted' : 'text-ink')}>
                      {t.counterparty || '—'}
                    </div>
                    <div className="truncate text-[11.5px] text-muted" title={t.description}>
                      {multiAccount && <span className="text-body">{fileOf.get(t.sourceId)} · </span>}
                      {t.description}
                    </div>
                  </td>
                  <td
                    className={
                      'whitespace-nowrap py-3 pr-4 text-right font-semibold tabular-nums ' +
                      (dim ? 'text-muted line-through decoration-1' : t.direction === 'in' ? 'text-g3' : 'text-ink')
                    }
                  >
                    {t.direction === 'in' ? '+' : '−'}
                    {full(t.amount)}
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={t.kind}
                      onChange={(e) => patchTxn(t, { kind: e.target.value as Kind })}
                      aria-label={`Kind for ${t.counterparty || t.description}`}
                      className={select}
                    >
                      {(Object.keys(KIND_OPTION) as Kind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_OPTION[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    {t.direction === 'out' ? (
                      <select
                        value={t.category}
                        onChange={(e) => patchTxn(t, { category: e.target.value as Category })}
                        aria-label={`Category for ${t.counterparty || t.description}`}
                        className={select}
                      >
                        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[12px] text-muted">Income</span>
                    )}
                  </td>
                  <td className="py-3 text-[11.5px]">
                    {changed && (
                      <div className="flex flex-col items-start gap-1">
                        {ownPatch && others > 0 && t.counterparty && (
                          <button
                            type="button"
                            onClick={() => promote(t)}
                            className="cursor-pointer whitespace-nowrap text-g3 hover:underline"
                          >
                            Apply to all {others + 1}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => reset(t)}
                          className="cursor-pointer text-muted hover:text-ink hover:underline"
                          title={
                            overrides.byCounterparty[t.counterparty]
                              ? `Also removes the rule for everything from ${t.counterparty}`
                              : undefined
                          }
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE * 4)}
          className="mt-5 cursor-pointer border-b border-ink py-1 text-[12px] font-medium text-ink"
        >
          Show more ({(rows.length - shown).toLocaleString()} left)
        </button>
      )}
    </Card>
  )
}
