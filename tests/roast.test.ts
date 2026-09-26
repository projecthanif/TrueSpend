import { describe, expect, it } from 'vitest'
import { aggregate } from '../src/lib/aggregate'
import type { Classified } from '../src/lib/classify'
import { makeFormatters } from '../src/lib/money'
import { roast } from '../src/lib/roast'
import type { Category, Direction, Kind, Txn } from '../src/lib/types'

const fmt = makeFormatters('NGN')

type Spec = Partial<Txn> & { date: string; direction: Direction; amount: number }

// Kinds are set directly: these tests are about the roasts, not classification.
function model(specs: Spec[]) {
  const txns: Txn[] = specs.map((s, i) => ({
    id: String(i),
    sourceId: 'a',
    description: '',
    counterparty: '',
    kind: 'external' as Kind,
    category: 'other' as Category,
    ...s,
  }))
  const dates = txns.map((t) => t.date).sort()
  const c: Classified = {
    txns,
    statements: [],
    first: dates[0],
    last: dates[dates.length - 1],
    currency: 'NGN',
    warnings: [],
    excluded: { external: 0, self: 0, internal: 0, fee: 0, reversal: 0 },
    overridden: new Set(),
  }
  return { c, agg: aggregate(c) }
}

const day = (n: number) => new Date(Date.UTC(2025, 0, 1 + n)).toISOString().slice(0, 10)
const ids = (specs: Spec[], opts = {}) => {
  const { c, agg } = model(specs)
  return roast(c, agg, fmt, opts).roasts.map((r) => r.id)
}

describe('roast detectors', () => {
  it('spots a pile of airtime top-ups', () => {
    const specs: Spec[] = Array.from({ length: 30 }, (_, i) => ({
      date: day(i),
      direction: 'out',
      amount: 500,
      category: 'airtime',
    }))
    expect(ids(specs)).toContain('airtime')
  })

  it('counts bank charges even though they are excluded from spend', () => {
    const specs: Spec[] = Array.from({ length: 20 }, (_, i) => ({
      date: day(i),
      direction: 'out',
      amount: 50,
      kind: 'fee',
    }))
    expect(ids(specs)).toContain('fees')
  })

  it('names a dominant payee', () => {
    const specs: Spec[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        date: day(i),
        direction: 'out' as const,
        amount: 10_000,
        counterparty: 'Chicken Republic',
      })),
      { date: day(10), direction: 'out', amount: 5_000, counterparty: 'Shoprite' },
    ]
    const { c, agg } = model(specs)
    const loyal = roast(c, agg, fmt).roasts.find((r) => r.id === 'loyal')
    expect(loyal?.evidence).toMatch(/Chicken Republic/)
  })

  it('never jokes about a medical payee', () => {
    const specs: Spec[] = Array.from({ length: 6 }, (_, i) => ({
      date: day(i),
      direction: 'out',
      amount: 10_000,
      counterparty: 'Lagoon Hospital',
    }))
    expect(ids(specs)).not.toContain('loyal')
  })

  it('does not roast paying the rent', () => {
    const specs: Spec[] = Array.from({ length: 3 }, (_, i) => ({
      date: day(i * 30),
      direction: 'out',
      amount: 150_000,
      counterparty: 'Landlord John',
    }))
    expect(ids(specs)).not.toContain('loyal')
  })

  it('times how fast the biggest pay-in drains', () => {
    const specs: Spec[] = [
      { date: day(0), direction: 'in', amount: 100_000, balance: 110_000 },
      { date: day(2), direction: 'out', amount: 60_000, balance: 50_000 },
      { date: day(4), direction: 'out', amount: 45_000, balance: 5_000 },
    ]
    const { c, agg } = model(specs)
    const payday = roast(c, agg, fmt).roasts.find((r) => r.id === 'payday')
    expect(payday?.evidence).toContain(day(4))
  })

  it('stays silent when there is nothing unusual', () => {
    expect(ids([{ date: day(0), direction: 'out', amount: 1_000 }])).toEqual([])
  })
})

describe('roast guardrails', () => {
  // Heavy loan repayments and more out than in.
  const strained: Spec[] = [
    { date: day(0), direction: 'in', amount: 50_000 },
    ...Array.from({ length: 5 }, (_, i) => ({
      date: day(i * 5),
      direction: 'out' as const,
      amount: 20_000,
      category: 'loan' as Category,
    })),
  ]

  it('caps the heat at mild and drops sensitive roasts under strain', () => {
    const { c, agg } = model(strained)
    const set = roast(c, agg, fmt, { heat: 'spicy' })
    expect(set.softened).toBe(true)
    expect(set.roasts.every((r) => r.heat === 'mild')).toBe(true)
    expect(set.roasts.map((r) => r.id)).not.toContain('overdraft')
  })

  it('lets the user opt out of the guardrail', () => {
    const { c, agg } = model(strained)
    const set = roast(c, agg, fmt, { heat: 'spicy', unlocked: true })
    expect(set.softened).toBe(false)
    expect(set.roasts.every((r) => r.heat === 'spicy')).toBe(true)
    expect(set.roasts.map((r) => r.id)).toContain('overdraft')
  })

  it('does not treat a low balance as strain when money is being kept', () => {
    // Salary swept out to savings each time: tiny balance, but net positive.
    const specs: Spec[] = Array.from({ length: 12 }, (_, i) => [
      { date: day(i * 5), direction: 'in' as const, amount: 100_000, balance: 100_500 },
      { date: day(i * 5 + 1), direction: 'out' as const, amount: 20_000, balance: 80_500 },
      { date: day(i * 5 + 1), direction: 'out' as const, amount: 80_000, balance: 500, kind: 'self' as Kind },
    ]).flat()
    const { c, agg } = model(specs)
    expect(roast(c, agg, fmt).softened).toBe(false)
  })

  it('always offers a compliment', () => {
    const { c, agg } = model(strained)
    expect(roast(c, agg, fmt).compliment.length).toBeGreaterThan(0)
  })

  it('rerolls pick different wording, not different facts', () => {
    const specs: Spec[] = Array.from({ length: 30 }, (_, i) => ({
      date: day(i),
      direction: 'out',
      amount: 500,
      category: 'airtime',
    }))
    const { c, agg } = model(specs)
    const a = roast(c, agg, fmt, { seed: 0 }).roasts[0]
    const b = roast(c, agg, fmt, { seed: 1 }).roasts[0]
    expect(a.line).not.toBe(b.line)
    expect(a.evidence).toBe(b.evidence)
  })
})
