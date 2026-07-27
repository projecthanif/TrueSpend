import { useEffect, useMemo, useState } from 'react'
import { Upload } from './components/Upload'
import { MappingReview } from './components/MappingReview'
import { IdentityPanel } from './components/IdentityPanel'
import { AnnualInflow } from './components/AnnualInflow'
import { DailyRhythm } from './components/DailyRhythm'
import { MonthlyRhythm } from './components/MonthlyRhythm'
import { Breakdown } from './components/Breakdown'
import { BalanceTrend } from './components/BalanceTrend'
import { Stat } from './components/ui'
import { applyMapping, type Ingested } from './lib/ingest'
import { classify, suggestIdentity } from './lib/classify'
import { aggregate } from './lib/aggregate'
import { FormatProvider } from './lib/format'
import { makeFormatters } from './lib/money'
import type { ColumnMap, Identity, Statement } from './lib/types'

type Pending = Extract<Ingested, { status: 'review' }>
type Failed = Extract<Ingested, { status: 'failed' }>

const KIND_LABEL: Record<string, string> = {
  self: 'moved between your own accounts',
  internal: 'in-app savings round trips',
  fee: 'bank charges, tax and levies',
  reversal: 'reversals and refunds',
}

export default function App() {
  const [statements, setStatements] = useState<Statement[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [failures, setFailures] = useState<Failed[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [currency, setCurrency] = useState<string | null>(null)

  /*
   * Identity is seeded from the statements but stays user-owned afterwards, so
   * adding a second file tops up the suggestions without discarding edits.
   */
  useEffect(() => {
    if (!statements.length) return
    const suggested = suggestIdentity(statements)
    setIdentity((prev) =>
      prev
        ? {
            names: [...new Set([...prev.names, ...suggested.names])],
            accountNumbers: [...new Set([...prev.accountNumbers, ...suggested.accountNumbers])],
          }
        : suggested,
    )
    setCurrency((prev) => prev ?? statements[0].meta.currency)
  }, [statements])

  const model = useMemo(() => {
    if (!statements.length || !identity) return null
    const classified = classify(statements, identity)
    return { classified, agg: aggregate(classified) }
  }, [statements, identity])

  const receive = (results: Ingested[]) => {
    setStatements((prev) => {
      const ready = results.flatMap((r) => (r.status === 'ready' ? [r.statement] : []))
      // Re-uploading the same file replaces it rather than doubling the totals.
      const kept = prev.filter((p) => !ready.some((s) => s.fileName === p.fileName))
      return [...kept, ...ready]
    })
    setPending((prev) => [...prev, ...results.filter((r) => r.status === 'review')] as Pending[])
    setFailures(results.filter((r) => r.status === 'failed') as Failed[])
  }

  const confirmMapping = (item: Pending, map: ColumnMap) => {
    const result = applyMapping(item.id, item.fileName, item.table, map)
    setPending((prev) => prev.filter((p) => p.id !== item.id))
    if (result.status === 'ready') setStatements((prev) => [...prev, result.statement])
    else if (result.status === 'failed') setFailures((prev) => [...prev, result])
  }

  const reset = () => {
    setStatements([])
    setPending([])
    setFailures([])
    setIdentity(null)
    setCurrency(null)
  }

  // --- a file needs its columns confirmed ---------------------------------
  if (pending.length) {
    const item = pending[0]
    return (
      <main className="mx-auto max-w-6xl px-7 py-12">
        <MappingReview
          fileName={item.fileName}
          table={item.table}
          map={item.map}
          reason={item.reason}
          onConfirm={(map) => confirmMapping(item, map)}
          onCancel={() => setPending((prev) => prev.filter((p) => p.id !== item.id))}
        />
      </main>
    )
  }

  // --- nothing loaded yet --------------------------------------------------
  if (!model) {
    return (
      <main className="mx-auto max-w-5xl px-7 py-16">
        <header className="mb-12 text-center">
          <h1 className="text-[56px] font-extrabold leading-[1.03] tracking-[-0.03em] text-ink">
            Statement
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-[17px] leading-relaxed text-body">
            Turn any bank statement into the picture your bank never shows you — what actually came
            in, what actually went out, and the rhythm underneath it.
          </p>
        </header>
        <Upload onIngested={receive} />
        <Failures items={failures} />
      </main>
    )
  }

  const { classified, agg } = model
  const excluded = Object.entries(classified.excluded).filter(([k, v]) => k !== 'external' && v > 0)
  const active = currency ?? classified.currency
  const fmt = makeFormatters(active)

  return (
    <FormatProvider currency={active}>
      <main className="mx-auto max-w-6xl px-7 py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-[46px] font-extrabold leading-[1.03] tracking-[-0.03em] text-ink">
              Statement
            </h1>
            <p className="mt-2 text-[14.5px] text-body">
              {statements.length} account{statements.length > 1 ? 's' : ''} ·{' '}
              {agg.coverage.first} to {agg.coverage.last}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Upload onIngested={receive} compactMode />
            <button
              type="button"
              onClick={reset}
              className="cursor-pointer rounded-xl px-3 py-2 text-[13.5px] text-muted transition hover:text-body"
            >
              Start over
            </button>
          </div>
        </header>

        <div className="mb-6">
          <IdentityPanel
            identity={identity!}
            currency={active}
            onChange={setIdentity}
            onCurrencyChange={setCurrency}
            selfTotal={fmt.full(classified.excluded.self)}
          />
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Money in" value={fmt.full(agg.totals.inflow)} hint="external credits only" />
          <Stat label="Money out" value={fmt.full(agg.totals.spend)} hint="external debits only" />
          <Stat
            label="Net"
            value={fmt.full(agg.totals.net)}
            hint={agg.totals.net >= 0 ? 'kept' : 'drawn down'}
          />
          <Stat
            label="Transactions"
            value={agg.totals.txns.toLocaleString()}
            hint="after filtering"
          />
        </div>

        <div className="space-y-8">
          <AnnualInflow data={agg} />
          <DailyRhythm data={agg} />
          <MonthlyRhythm data={agg} />
          <Breakdown data={agg} />
          <BalanceTrend data={agg} />
        </div>

        {excluded.length > 0 && (
          <section className="mt-8 rounded-3xl border border-line bg-card px-7 py-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-body">
              Deliberately excluded
            </h2>
            <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">
              Counting these would inflate both income and spending — the same money appears several
              times as it moves between your own accounts.
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              {excluded.map(([kind, amount]) => (
                <li key={kind} className="text-[13.5px]">
                  <b className="text-ink">{fmt.full(amount)}</b>{' '}
                  <span className="text-body">{KIND_LABEL[kind] ?? kind}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Failures items={failures} />

        {classified.warnings.length > 0 && (
          <ul className="mt-6 space-y-1 text-[13px] text-muted">
            {classified.warnings.map((w) => (
              <li key={w}>Note: {w}</li>
            ))}
          </ul>
        )}
      </main>
    </FormatProvider>
  )
}

function Failures({ items }: { items: Failed[] }) {
  if (!items.length) return null
  return (
    <ul className="mx-auto mt-6 max-w-2xl space-y-1.5 rounded-2xl border border-[#e9c9c9] bg-[#fbf1f1] px-5 py-4 text-[13.5px] text-[#8f3b3b]">
      {items.map((f) => (
        <li key={f.fileName}>
          <b>{f.fileName}</b> — {f.error}
        </li>
      ))}
    </ul>
  )
}
