import { useMemo, useState } from 'react'
import type { ColumnMap, ColumnRole, DateFormat, RawTable } from '../lib/types'
import { parseDate } from '../lib/dates'
import { parseAmount } from '../lib/money'

const ROLES: { value: ColumnRole; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description' },
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
  { value: 'amount', label: 'Amount (signed)' },
  { value: 'balance', label: 'Balance' },
]

const FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'DMY', label: 'Day / Month / Year' },
  { value: 'MDY', label: 'Month / Day / Year' },
  { value: 'YMD', label: 'Year / Month / Day' },
]

interface Props {
  fileName: string
  table: RawTable
  map: ColumnMap
  reason: string
  onConfirm: (map: ColumnMap) => void
  onCancel: () => void
}

/**
 * Shown when column detection isn't confident. The live preview matters more
 * than the dropdowns: it's how the user can tell they've got it right without
 * understanding anything about the file format.
 */
export function MappingReview({ fileName, table, map, reason, onConfirm, onCancel }: Props) {
  const [roles, setRoles] = useState<ColumnRole[]>(map.roles)
  const [dateFormat, setDateFormat] = useState<DateFormat>(map.dateFormat ?? 'DMY')

  const header = table.headerIndex >= 0 ? table.rows[table.headerIndex] : null
  const body = useMemo(
    () => table.rows.slice(table.headerIndex + 1).filter((r) => r.some(Boolean)),
    [table],
  )
  const width = Math.max(...table.rows.map((r) => r.length), roles.length)

  const setRole = (col: number, role: ColumnRole) =>
    setRoles((prev) => {
      const next = [...prev]
      while (next.length < width) next.push('ignore')
      // Every role except "ignore" belongs to exactly one column.
      if (role !== 'ignore') next.forEach((r, i) => { if (r === role) next[i] = 'ignore' })
      next[col] = role
      return next
    })

  // Live preview of what these choices actually produce.
  const preview = useMemo(() => {
    const col = (r: ColumnRole) => roles.indexOf(r)
    const dateCol = col('date')
    const descCol = col('description')
    const debitCol = col('debit')
    const creditCol = col('credit')
    const amountCol = col('amount')

    let parsed = 0
    const rows = body.slice(0, 6).map((r) => {
      const date = dateCol >= 0 ? parseDate(r[dateCol], dateFormat) : null
      const debit = debitCol >= 0 ? parseAmount(r[debitCol]) : null
      const credit = creditCol >= 0 ? parseAmount(r[creditCol]) : null
      const single = amountCol >= 0 ? parseAmount(r[amountCol]) : null
      const amount = credit || debit || single
      if (date && amount) parsed++
      return {
        date,
        description: descCol >= 0 ? (r[descCol] ?? '') : '',
        amount,
        direction: credit ? 'in' : debit ? 'out' : single && single < 0 ? 'out' : 'in',
      }
    })

    const total = body.filter((r) => {
      if (dateCol < 0 || !parseDate(r[dateCol], dateFormat)) return false
      return [debitCol, creditCol, amountCol].some((c) => c >= 0 && parseAmount(r[c]))
    }).length

    return { rows, parsed, total }
  }, [roles, dateFormat, body])

  const hasDate = roles.includes('date')
  const hasMoney = roles.includes('debit') || roles.includes('credit') || roles.includes('amount')
  const ok = hasDate && hasMoney && preview.total > 0

  return (
    <div className="rise mx-auto mt-16 w-full max-w-6xl border-t border-line pt-8">
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-g3">
          One quick check
        </p>
        <h2 className="text-[clamp(2.5rem,6vw,4.8rem)] font-medium leading-none tracking-[-0.05em] text-ink">
          Check the columns.
        </h2>
        <p className="mt-4 max-w-2xl text-[14px] leading-6 text-body">
          <b>{fileName}</b> — {reason} Tell the app what each column holds; the preview below updates
          as you go.
        </p>

        <div className="scroll-thin mt-6 overflow-x-auto">
          <table className="w-full border-separate border-spacing-x-2 border-spacing-y-1 text-left">
            <thead>
              <tr>
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} className="min-w-[150px] align-top">
                    <select
                      aria-label={`Column ${c + 1} role`}
                      value={roles[c] ?? 'ignore'}
                      onChange={(e) => setRole(c, e.target.value as ColumnRole)}
                      className={
                        'w-full cursor-pointer border px-2.5 py-2 text-[12px] font-medium transition-colors ' +
                        ((roles[c] ?? 'ignore') === 'ignore'
                          ? 'border-line bg-card text-muted'
                          : 'border-ink bg-ink text-card')
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    {header?.[c] && (
                      <div className="mt-1.5 truncate px-1 text-[11.5px] text-muted" title={header[c]}>
                        {header[c]}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.slice(0, 5).map((row, i) => (
                <tr key={i}>
                  {Array.from({ length: width }, (_, c) => (
                    <td
                      key={c}
                      className="max-w-[220px] truncate border-b border-line px-2.5 py-2 text-[12px] text-body"
                      title={row[c]}
                    >
                      {row[c] || <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5">
          <label className="flex items-center gap-2.5 text-[13.5px] text-body">
            Date order
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              className="cursor-pointer border border-line bg-card px-2.5 py-1.5 text-[12px]"
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[13px] text-muted">
            {preview.total.toLocaleString()} of {body.length.toLocaleString()} rows read
          </span>
        </div>

        {/* Live preview — the real test of whether the mapping is right. */}
        <div className="mt-5 border-l-2 border-ink bg-card px-5 py-4">
          <div className="mb-3 text-[11.5px] uppercase tracking-[0.14em] text-muted">Preview</div>
          {ok ? (
            <ul className="space-y-1.5">
              {preview.rows.map((r, i) => (
                <li key={i} className="grid grid-cols-[92px_1fr_auto] items-baseline gap-3 text-[13px]">
                  <span className={r.date ? 'text-body' : 'text-[#b4534f]'}>{r.date ?? 'no date'}</span>
                  <span className="truncate text-ink" title={r.description}>
                    {r.description || <span className="text-muted">—</span>}
                  </span>
                  <span className={r.direction === 'in' ? 'font-semibold text-g3' : 'font-semibold text-p5'}>
                    {r.direction === 'in' ? '+' : '−'}
                    {r.amount ? Math.abs(r.amount).toLocaleString() : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-[#8f3b3b]">
              {!hasDate
                ? 'Pick which column holds the date.'
                : !hasMoney
                  ? 'Pick at least one money column — either “Money out” and “Money in”, or a single signed “Amount”.'
                  : 'No rows could be read. Try a different date order.'}
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            disabled={!ok}
            onClick={() => onConfirm({ roles, dateFormat, confidence: 1, notes: [] })}
            className="cursor-pointer border border-ink bg-ink px-5 py-2.5 text-[13px] font-semibold text-card transition-colors hover:bg-p5 disabled:cursor-not-allowed disabled:border-line disabled:bg-line"
          >
            Use this mapping
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer px-4 py-2.5 text-[13px] text-muted transition-colors hover:text-ink"
          >
            Skip this file
          </button>
        </div>
      </div>
    </div>
  )
}
