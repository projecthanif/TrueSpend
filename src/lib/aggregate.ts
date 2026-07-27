import type { Category, Txn } from './types'
import type { Classified } from './classify'

export interface YearInflow {
  year: number
  total: number
  months: number
  bySource: Record<string, number>
}

export interface DayCell {
  date: string
  amount: number
  txns: number
}

export interface MonthCell {
  key: string // YYYY-MM
  year: number
  month: number // 0-11
  amount: number
  txns: number
  activeDays: number
}

export interface CounterpartyRow {
  name: string
  amount: number
  txns: number
}

export interface BalancePoint {
  date: string
  balance: number
}

export interface Aggregates {
  years: number[]
  inflow: YearInflow[]
  daily: Map<string, DayCell>
  monthly: MonthCell[]
  categories: { category: Category; amount: number; txns: number }[]
  payees: CounterpartyRow[]
  payers: CounterpartyRow[]
  balance: BalancePoint[]
  totals: { inflow: number; spend: number; net: number; txns: number }
  coverage: { first: string; last: string }
}

const ym = (d: string) => d.slice(0, 7)
const yr = (d: string) => Number(d.slice(0, 4))

function rank(txns: Txn[], n = 12): CounterpartyRow[] {
  const m = new Map<string, CounterpartyRow>()
  for (const t of txns) {
    const key = t.counterparty || '—'
    const row = m.get(key) ?? { name: key, amount: 0, txns: 0 }
    row.amount += t.amount
    row.txns++
    m.set(key, row)
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, n)
}

export function aggregate(c: Classified): Aggregates {
  // Every chart works off external money only — see classify.ts for why.
  const real = c.txns.filter((t) => t.kind === 'external')
  const income = real.filter((t) => t.direction === 'in')
  const spend = real.filter((t) => t.direction === 'out')

  // ---- annual inflow -------------------------------------------------
  const inflowMap = new Map<number, YearInflow>()
  for (const t of income) {
    const y = yr(t.date)
    const row = inflowMap.get(y) ?? { year: y, total: 0, months: 0, bySource: {} }
    row.total += t.amount
    row.bySource[t.sourceId] = (row.bySource[t.sourceId] ?? 0) + t.amount
    inflowMap.set(y, row)
  }
  const monthsSeen = new Map<number, Set<string>>()
  for (const t of real) {
    const y = yr(t.date)
    if (!monthsSeen.has(y)) monthsSeen.set(y, new Set())
    monthsSeen.get(y)!.add(ym(t.date))
  }
  const inflow = [...inflowMap.values()]
    .map((r) => ({ ...r, months: monthsSeen.get(r.year)?.size ?? 0 }))
    .sort((a, b) => a.year - b.year)

  // ---- daily spend ---------------------------------------------------
  const daily = new Map<string, DayCell>()
  for (const t of spend) {
    const cell = daily.get(t.date) ?? { date: t.date, amount: 0, txns: 0 }
    cell.amount += t.amount
    cell.txns++
    daily.set(t.date, cell)
  }

  // ---- monthly spend -------------------------------------------------
  const monthMap = new Map<string, MonthCell>()
  for (const cell of daily.values()) {
    const key = ym(cell.date)
    const row =
      monthMap.get(key) ??
      ({
        key,
        year: yr(cell.date),
        month: Number(key.slice(5)) - 1,
        amount: 0,
        txns: 0,
        activeDays: 0,
      } as MonthCell)
    row.amount += cell.amount
    row.txns += cell.txns
    row.activeDays++
    monthMap.set(key, row)
  }
  const monthly = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key))

  // ---- categories ----------------------------------------------------
  const catMap = new Map<Category, { category: Category; amount: number; txns: number }>()
  for (const t of spend) {
    const row = catMap.get(t.category) ?? { category: t.category, amount: 0, txns: 0 }
    row.amount += t.amount
    row.txns++
    catMap.set(t.category, row)
  }
  const categories = [...catMap.values()].sort((a, b) => b.amount - a.amount)

  // ---- running balance ------------------------------------------------
  // Balances from different accounts can't be summed, so chart the single
  // account that reports one most often.
  const withBalance = c.txns.filter((t) => typeof t.balance === 'number')
  const perSource = new Map<string, number>()
  for (const t of withBalance) perSource.set(t.sourceId, (perSource.get(t.sourceId) ?? 0) + 1)
  const main = [...perSource.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  const balance: BalancePoint[] = []
  if (main) {
    const lastOfDay = new Map<string, number>()
    for (const t of withBalance.filter((t) => t.sourceId === main)) lastOfDay.set(t.date, t.balance!)
    for (const [date, bal] of [...lastOfDay.entries()].sort((a, b) => a[0].localeCompare(b[0])))
      balance.push({ date, balance: bal })
  }

  const totalIn = income.reduce((s, t) => s + t.amount, 0)
  const totalOut = spend.reduce((s, t) => s + t.amount, 0)

  return {
    years: inflow.map((r) => r.year),
    inflow,
    daily,
    monthly,
    categories,
    payees: rank(spend),
    payers: rank(income),
    balance,
    totals: { inflow: totalIn, spend: totalOut, net: totalIn - totalOut, txns: real.length },
    coverage: { first: c.first, last: c.last },
  }
}

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
