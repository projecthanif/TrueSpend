import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSaved, loadSaved, save, txnKey } from '../src/lib/storage'
import { buildStatement } from '../src/lib/buildStatement'
import type { ColumnMap, RawTable } from '../src/lib/types'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => [...m.values()].join(''),
  }
}

let store: ReturnType<typeof memoryStorage>
beforeEach(() => {
  store = memoryStorage()
  vi.stubGlobal('localStorage', store)
})
afterEach(() => vi.unstubAllGlobals())

const saved = {
  identity: { names: ['MUSTAPHA IBRAHIM'], accountNumbers: ['0123456789'] },
  overrides: { byTxn: { abc: { kind: 'self' as const } }, byCounterparty: { 'Aisha Bello': { category: 'bills' as const } } },
}

describe('saved settings', () => {
  it('is null until the user opts in', () => {
    expect(loadSaved()).toBeNull()
  })

  it('round-trips, and clearing forgets everything', () => {
    save(saved)
    expect(loadSaved()).toEqual(saved)
    clearSaved()
    expect(loadSaved()).toBeNull()
  })

  it('drops malformed or unknown values instead of trusting them', () => {
    localStorage.setItem(
      'truespend:v1',
      JSON.stringify({
        identity: { names: ['OK', 42], accountNumbers: 'nope' },
        overrides: { byTxn: { a: { kind: 'bogus' }, b: { kind: 'fee', extra: 1 } }, byCounterparty: null },
      }),
    )
    expect(loadSaved()).toEqual({
      identity: { names: ['OK'], accountNumbers: [] },
      overrides: { byTxn: { b: { kind: 'fee' } }, byCounterparty: {} },
    })
  })

  it('treats corrupt JSON as nothing saved', () => {
    localStorage.setItem('truespend:v1', '{not json')
    expect(loadSaved()).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    const blocked = () => {
      throw new Error('SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(loadSaved()).toBeNull()
    expect(() => save(saved)).not.toThrow()
    expect(() => clearSaved()).not.toThrow()
  })
})

describe('row keys', () => {
  const row = { date: '2025-01-05', direction: 'out', amount: 700, description: 'AIRTIME MTN 08012345678' }

  it('are stable, and differ by account, content and occurrence', () => {
    expect(txnKey('A', row, 1)).toBe(txnKey('A', row, 1))
    expect(txnKey('A', row, 1)).not.toBe(txnKey('B', row, 1))
    expect(txnKey('A', row, 1)).not.toBe(txnKey('A', row, 2))
    expect(txnKey('A', row, 1)).not.toBe(txnKey('A', { ...row, amount: 701 }, 1))
  })

  it('keep statement content out of storage', () => {
    save({ ...saved, overrides: { byTxn: { [txnKey('0123456789', row, 1)]: { kind: 'self' } }, byCounterparty: {} } })
    expect(store.dump()).not.toMatch(/AIRTIME|08012345678|2025-01-05|700/)
  })
})

describe('transaction ids', () => {
  const table: RawTable = {
    headerIndex: 0,
    preamble: ['Account Number: 0123456789'],
    rows: [
      ['Date', 'Description', 'Debit', 'Credit'],
      ['2025-01-05', 'AIRTIME MTN', '700.00', ''],
      ['2025-01-05', 'AIRTIME MTN', '700.00', ''],
      ['2025-01-06', 'SALARY', '', '5000.00'],
    ],
  }
  const map: ColumnMap = { roles: ['date', 'description', 'debit', 'credit'], dateFormat: null, confidence: 1, notes: [] }

  it('survive a reload: same file, different session id, same row ids', () => {
    const first = buildStatement('src-1', 'jan.csv', table, map).txns.map((t) => t.id)
    const again = buildStatement('src-7', 'jan.csv', table, map).txns.map((t) => t.id)
    expect(again).toEqual(first)
    expect(new Set(first).size).toBe(3) // identical rows still get distinct ids
  })
})
