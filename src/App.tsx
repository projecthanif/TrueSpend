import { useEffect, useMemo, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { Upload } from './components/Upload'
import { MappingReview } from './components/MappingReview'
import { IdentityPanel } from './components/IdentityPanel'
import { AnnualInflow } from './components/AnnualInflow'
import { DailyRhythm } from './components/DailyRhythm'
import { MonthlyRhythm } from './components/MonthlyRhythm'
import { Breakdown } from './components/Breakdown'
import { BalanceTrend } from './components/BalanceTrend'
import { Transactions } from './components/Transactions'
import { Roast } from './components/Roast'
import { Stat, Tabs } from './components/ui'
import { applyMapping, type Ingested } from './lib/ingest'
import { classify, currencyGroups, NO_OVERRIDES, suggestIdentity } from './lib/classify'
import { aggregate } from './lib/aggregate'
import { FormatProvider } from './lib/format'
import { makeFormatters } from './lib/money'
import { clearSaved, loadSaved, save } from './lib/storage'
import type { ColumnMap, Identity, Overrides, Statement } from './lib/types'

type Pending = Extract<Ingested, { status: 'review' }>
type Failed = Extract<Ingested, { status: 'failed' }>

const KIND_LABEL: Record<string, string> = {
  self: 'moved between your own accounts',
  internal: 'in-app savings round trips',
  fee: 'bank charges, tax and levies',
  reversal: 'reversed payments and their refunds',
}

export default function App() {
  const [statements, setStatements] = useState<Statement[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [failures, setFailures] = useState<Failed[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  /** Which currency's dashboard is on screen, when statements span several. */
  const [view, setView] = useState<string | null>(null)
  // Opted in exactly when something is saved — switching off wipes storage.
  const [remember, setRemember] = useState(() => loadSaved() !== null)
  const [overrides, setOverrides] = useState<Overrides>(
    () => loadSaved()?.overrides ?? NO_OVERRIDES,
  )

  /*
   * Identity is seeded from the statements but stays user-owned afterwards, so
   * adding a second file tops up the suggestions without discarding edits.
   */
  useEffect(() => {
    if (!statements.length) return
    const suggested = suggestIdentity(statements)
    setIdentity((prev) => {
      // A remembered identity from an earlier visit counts as prior edits.
      const base = prev ?? loadSaved()?.identity
      return base
        ? {
            names: [...new Set([...base.names, ...suggested.names])],
            accountNumbers: [...new Set([...base.accountNumbers, ...suggested.accountNumbers])],
          }
        : suggested
    })
  }, [statements])

  useEffect(() => {
    if (remember && identity) save({ identity, overrides })
  }, [remember, identity, overrides])

  const toggleRemember = (on: boolean) => {
    setRemember(on)
    if (!on) clearSaved()
  }

  const groups = useMemo(() => currencyGroups(statements), [statements])
  const shown = groups.find((g) => g.currency === view) ?? groups[0]

  const model = useMemo(() => {
    if (!shown || !identity) return null
    const classified = classify(shown.statements, identity, overrides)
    return { classified, agg: aggregate(classified) }
  }, [shown, identity, overrides])

  /** Detection can misread a currency; fixing it moves the file to its group. */
  const setStatementCurrency = (id: string, currency: string) =>
    setStatements((prev) =>
      prev.map((s) => (s.id === id ? { ...s, meta: { ...s.meta, currency } } : s)),
    )

  const receive = (results: Ingested[]) => {
    setStatements((prev) => {
      const ready = results.flatMap((r) => (r.status === 'ready' ? [r.statement] : []))
      // Re-uploading the same file replaces it rather than doubling the totals.
      const kept = prev.filter((p) => !ready.some((s) => s.fileName === p.fileName))
      return [...kept, ...ready]
    })
    setPending((prev) => [...prev, ...results.filter((r) => r.status === 'review')] as Pending[])
    // Accumulate, so adding a second batch doesn't hide the first batch's errors.
    setFailures((prev) => {
      const failed = results.filter((r) => r.status === 'failed') as Failed[]
      const retried = new Set(
        results.map((r) => (r.status === 'ready' ? r.statement.fileName : r.fileName)),
      )
      return [...prev.filter((f) => !retried.has(f.fileName)), ...failed]
    })
  }

  const confirmMapping = (item: Pending, map: ColumnMap) => {
    const result = applyMapping(item.id, item.fileName, item.table, map)
    setPending((prev) => prev.filter((p) => p.id !== item.id))
    if (result.status === 'ready')
      setStatements((prev) => [...prev.filter((p) => p.fileName !== item.fileName), result.statement])
    else if (result.status === 'failed') setFailures((prev) => [...prev, result])
  }

  const reset = () => {
    setStatements([])
    setPending([])
    setFailures([])
    setIdentity(null)
    setView(null)
    // Start over clears the session, not what the user chose to remember.
    setOverrides(loadSaved()?.overrides ?? NO_OVERRIDES)
  }

  // --- a file needs its columns confirmed ---------------------------------
  if (pending.length) {
    const item = pending[0]
    return (
      <>
        <main className="mx-auto min-h-screen max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
          <ProductMark />
          <MappingReview
            fileName={item.fileName}
            table={item.table}
            map={item.map}
            reason={item.reason}
            onConfirm={(map) => confirmMapping(item, map)}
            onCancel={() => setPending((prev) => prev.filter((p) => p.id !== item.id))}
          />
        </main>
        <Analytics />
      </>
    )
  }

  // --- nothing loaded yet --------------------------------------------------
  if (!model) {
    return (
      <>
        <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-7 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between border-b border-line pb-5">
          <ProductMark />
          <div className="flex items-center gap-2 text-[12px] font-medium text-body">
            <span className="size-1.5 rounded-full bg-g3" />
            Private by design
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20 lg:py-20">
          <section>
            <p className="mb-7 text-[11px] font-semibold uppercase tracking-[0.22em] text-g3">
              Personal finance, clarified
            </p>
            <h1 className="max-w-2xl text-[clamp(3.75rem,8vw,7.4rem)] font-medium leading-[0.86] tracking-[-0.065em] text-ink">
              Your money,
              <span className="block text-body">made legible.</span>
            </h1>
            <p className="mt-8 max-w-lg text-[16px] leading-7 text-body sm:text-[18px]">
              Turn scattered bank statements into one honest view of what came in, what went out,
              and the patterns in between.
            </p>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5 text-[12px] text-muted">
              <span>PDF, Excel or CSV</span>
              <span>Multiple accounts</span>
              <span>No uploads. Ever.</span>
            </div>
          </section>

          <section className="lg:pt-10">
            <Upload onIngested={receive} />
            <Failures items={failures} />
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-line pt-5 text-[11px] uppercase tracking-[0.16em] text-muted">
          <span>Annual flow</span>
          <span>Spending rhythm</span>
          <span>Balance trend</span>
        </footer>
      </main>
        <Analytics />
      </>
    )
  }

  const { classified, agg } = model
  const excluded = Object.entries(classified.excluded).filter(([k, v]) => k !== 'external' && v > 0)
  const active = shown.currency
  const fmt = makeFormatters(active)
  const accounts = shown.statements.length

  return (
    <FormatProvider currency={active}>
      <main className="mx-auto min-h-screen max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
        <div className="mb-16 flex items-center justify-between border-b border-line pb-5">
          <ProductMark />
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span className="size-1.5 rounded-full bg-g3" />
            {remember ? 'Processed locally · settings remembered' : 'Processed locally'}
          </div>
        </div>

        <header className="mb-10 flex flex-wrap items-end justify-between gap-7">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-g3">
              Financial overview
            </p>
            <h1 className="text-[clamp(2.8rem,6vw,5.5rem)] font-medium leading-[0.92] tracking-[-0.055em] text-ink">
              The full picture.
            </h1>
            <p className="mt-4 text-[14px] text-body">
              {accounts} {groups.length > 1 && `${active} `}account{accounts > 1 ? 's' : ''} ·{' '}
              {agg.coverage.first} to {agg.coverage.last}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Upload onIngested={receive} compactMode />
            <button
              type="button"
              onClick={reset}
              className="cursor-pointer px-4 py-2.5 text-[12px] font-medium text-muted transition-colors hover:text-ink"
            >
              Start over
            </button>
          </div>
        </header>

        {groups.length > 1 && (
          <div className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <Tabs items={groups.map((g) => g.currency)} value={active} onChange={setView} />
            <p className="max-w-md text-[12.5px] leading-relaxed text-muted">
              Your statements use {groups.length} currencies. Each has its own totals: adding
              them together would need an exchange rate for every day, and this app never goes
              online to fetch one.
            </p>
          </div>
        )}

        <div className="mb-10">
          <IdentityPanel
            identity={identity!}
            statements={statements.map((s) => ({
              id: s.id,
              fileName: s.fileName,
              currency: s.meta.currency,
            }))}
            onChange={setIdentity}
            onStatementCurrency={setStatementCurrency}
            remember={remember}
            onRememberChange={toggleRemember}
            selfTotal={fmt.full(classified.excluded.self)}
          />
        </div>

        <div className="mb-20 grid border-y border-line sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="space-y-24">
          <AnnualInflow data={agg} />
          <DailyRhythm data={agg} />
          <MonthlyRhythm data={agg} />
          <Breakdown data={agg} />
          <BalanceTrend data={agg} />
          <Roast classified={classified} data={agg} />
          <Transactions data={classified} overrides={overrides} onChange={setOverrides} />
        </div>

        {excluded.length > 0 && (
          <section className="mt-24 border-t border-line py-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-body">
              Deliberately excluded
            </h2>
            <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">
              Counting these would inflate both income and spending — the same money appears several
              times as it moves between your own accounts.
            </p>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {excluded.map(([kind, amount]) => (
                <li key={kind} className="text-[13px]">
                  <b className="block text-[18px] font-medium text-ink">{fmt.full(amount)}</b>
                  <span className="mt-1 block text-muted">{KIND_LABEL[kind] ?? kind}</span>
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
      <Analytics />
    </FormatProvider>
  )
}

function Failures({ items }: { items: Failed[] }) {
  if (!items.length) return null
  return (
    <ul className="mt-5 space-y-1.5 border-l-2 border-[#a4493d] bg-[#f8efec] px-4 py-3 text-[13px] text-[#893b32]">
      {items.map((f) => (
        <li key={f.fileName}>
          <b>{f.fileName}</b> — {f.error}
        </li>
      ))}
    </ul>
  )
}

function ProductMark() {
  return (
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="size-7" aria-hidden="true" />
      <span className="text-[14px] font-semibold tracking-[-0.02em] text-ink">TrueSpend</span>
    </div>
  )
}
