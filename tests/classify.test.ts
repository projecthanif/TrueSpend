import { describe, expect, it } from 'vitest'
import { classify, currencyGroups, makeSelfMatcher } from '../src/lib/classify'
import { aggregate } from '../src/lib/aggregate'
import type { Identity, Statement, Txn } from '../src/lib/types'

const ME: Identity = { names: ['MUSTAPHA IBRAHIM'], accountNumbers: ['0123456789'] }

type Row = [date: string, direction: 'in' | 'out', amount: number, description: string, counterparty?: string]

function statement(id: string, rows: Row[], accountNumber = '0123456789', currency = 'NGN'): Statement {
  const txns: Txn[] = rows.map(([date, direction, amount, description, counterparty = ''], i) => ({
    id: `${id}:${i}`,
    date,
    sourceId: id,
    direction,
    amount,
    description,
    counterparty,
    kind: 'external',
    category: 'other',
  }))
  return {
    id,
    fileName: `${id}.csv`,
    meta: { accountNumber, currency },
    map: { roles: [], dateFormat: null, confidence: 1, notes: [] },
    table: { headerIndex: -1, rows: [], preamble: [] },
    txns,
    first: txns[0].date,
    last: txns[txns.length - 1].date,
    warnings: [],
  }
}

const kinds = (s: Statement[], identity = ME) => classify(s, identity).txns.map((t) => t.kind)

describe('reversal pairing', () => {
  it('removes the debit a reversal cancels, not just the refund', () => {
    const c = classify(
      [
        statement('a', [
          ['2025-01-01', 'out', 50_000, 'NIP TRANSFER TO JOHN DOE', 'John Doe'],
          ['2025-01-03', 'in', 50_000, 'RVSL NIP TRANSFER TO JOHN DOE'],
          ['2025-01-04', 'out', 2_000, 'POS PRCH 123456 SHOPRITE', 'Shoprite'],
        ]),
      ],
      ME,
    )
    expect(c.txns.map((t) => t.kind)).toEqual(['reversal', 'reversal', 'external'])
    expect(aggregate(c).totals.spend).toBe(2_000)
  })

  it('pairs with the latest matching entry, once', () => {
    const k = kinds([
      statement('a', [
        ['2025-01-01', 'out', 1_000, 'AIRTIME MTN'],
        ['2025-01-02', 'out', 1_000, 'AIRTIME MTN'],
        ['2025-01-03', 'in', 1_000, 'REVERSAL AIRTIME'],
      ]),
    ])
    expect(k).toEqual(['external', 'reversal', 'reversal'])
  })

  it('ignores entries outside the window, on other accounts, or for other amounts', () => {
    const k = kinds([
      statement('a', [
        ['2025-01-01', 'out', 1_000, 'TRANSFER TO A'],
        ['2025-02-01', 'out', 1_500, 'TRANSFER TO B'],
        ['2025-02-02', 'in', 1_000, 'REVERSAL'],
      ]),
      statement('b', [['2025-02-01', 'out', 1_000, 'TRANSFER TO C']], '999999999'),
    ])
    expect(k.filter((x) => x === 'reversal')).toHaveLength(1)
  })
})

describe('overlapping statements', () => {
  const jan: Row = ['2025-01-05', 'out', 700, 'AIRTIME MTN']
  const feb: Row = ['2025-02-05', 'out', 900, 'DATA BUNDLE']

  it('counts an entry reported by two files of the same account once', () => {
    const c = classify([statement('a', [jan, feb]), statement('b', [feb, ['2025-03-01', 'out', 50, 'X']])], ME)
    expect(c.txns).toHaveLength(3)
    expect(c.warnings.some((w) => w.includes('counted once'))).toBe(true)
  })

  it('keeps genuine duplicates within one file', () => {
    expect(classify([statement('a', [jan, jan])], ME).txns).toHaveLength(2)
  })

  it('only drops as many copies as the earlier file had', () => {
    expect(classify([statement('a', [jan]), statement('b', [jan, jan])], ME).txns).toHaveLength(2)
  })

  it('does not merge different accounts', () => {
    const c = classify([statement('a', [jan], '111111111'), statement('b', [jan], '222222222')], ME)
    expect(c.txns).toHaveLength(2)
  })
})

describe('overrides', () => {
  const s = statement('a', [
    ['2025-01-01', 'in', 10_000, 'TRANSFER FROM AISHA BELLO', 'Aisha Bello'],
    ['2025-01-02', 'in', 20_000, 'TRANSFER FROM AISHA BELLO', 'Aisha Bello'],
    ['2025-01-03', 'out', 3_000, 'POS PRCH 123456 CAFE', 'Cafe'],
  ])

  it('a counterparty rule applies to every row, and a row patch beats it', () => {
    const c = classify([s], ME, {
      byCounterparty: { 'Aisha Bello': { kind: 'self' } },
      byTxn: { 'a:1': { kind: 'external' }, 'a:2': { category: 'bills' } },
    })
    expect(c.txns.map((t) => t.kind)).toEqual(['self', 'external', 'external'])
    expect(c.txns[2].category).toBe('bills')
    expect([...c.overridden].sort()).toEqual(['a:0', 'a:1', 'a:2'])
  })

  it('a manual kind is never re-paired as a reversal', () => {
    const c = classify(
      [
        statement('a', [
          ['2025-01-01', 'out', 500, 'TRANSFER TO X'],
          ['2025-01-02', 'in', 500, 'REVERSAL'],
        ]),
      ],
      ME,
      { byCounterparty: {}, byTxn: { 'a:0': { kind: 'external' } } },
    )
    expect(c.txns[0].kind).toBe('external')
  })
})

describe('categories', () => {
  it('does not read "branch" in a narration as a loan', () => {
    const c = classify([statement('a', [['2025-01-01', 'out', 100, 'CASH DEPOSIT LAGOS BRANCH']])], ME)
    expect(c.txns[0].category).not.toBe('loan')
  })

  it('still recognises the lenders by name', () => {
    const c = classify([statement('a', [['2025-01-01', 'out', 100, 'BRANCH INTERNATIONAL REPAYMENT']])], ME)
    expect(c.txns[0].category).toBe('loan')
  })
})

describe('self matcher', () => {
  const isSelf = makeSelfMatcher({ names: ['MUSTAPHA IBRAHIM', 'MUSTAPHA ALHAJI IBRAHIM'], accountNumbers: ['0123456789', '9876543210'] })

  it('accepts name variants and rejects reordered or foreign names', () => {
    expect(isSelf('Mustapha Alhaji Ibrahim')).toBe(true)
    expect(isSelf('Ibrahim Mustapha')).toBe(false)
    expect(isSelf('Mustapha Liman Mohammed')).toBe(false)
  })

  it('treats only a different account of yours as conclusive', () => {
    expect(isSelf('MTN', 'Airtime | 0123456789 | MTN', '0123456789')).toBe(false)
    expect(isSelf('Someone', 'TRF 9876543210', '0123456789')).toBe(true)
  })
})

describe('currencies', () => {
  const ngn = statement('a', [
    ['2025-01-01', 'in', 500_000, 'SALARY'],
    ['2025-01-02', 'out', 1_000, 'AIRTIME'],
  ])
  const ngn2 = statement('b', [['2025-01-03', 'in', 20_000, 'GIFT']], '222222222')
  const usd = statement('c', [['2025-01-01', 'in', 1_000, 'PAYPAL PAYOUT']], '333333333', 'USD')

  it('groups statements by currency, largest first', () => {
    const groups = currencyGroups([usd, ngn, ngn2])
    expect(groups.map((g) => [g.currency, g.statements.map((s) => s.id), g.txns])).toEqual([
      ['NGN', ['a', 'b'], 3],
      ['USD', ['c'], 1],
    ])
  })

  it('never adds one currency to another', () => {
    const [naira, dollars] = currencyGroups([ngn, ngn2, usd]).map((g) =>
      aggregate(classify(g.statements, ME)).totals.inflow,
    )
    expect(naira).toBe(520_000)
    expect(dollars).toBe(1_000)
  })

  it('still warns if mixed statements are classified together', () => {
    expect(classify([ngn, usd], ME).warnings.some((w) => w.includes('different currencies'))).toBe(true)
  })
})
