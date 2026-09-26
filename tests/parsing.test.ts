import { describe, expect, it } from 'vitest'
import { detectCurrency, parseAmount } from '../src/lib/money'
import { parseDate } from '../src/lib/dates'
import { toCsv } from '../src/lib/export'

// Regressions from the README's "extraction gotchas" — each one silently
// corrupted real statements before it was fixed.

describe('parseAmount', () => {
  it.each([
    ['1,234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['(1,234.56)', -1234.56],
    ['1,234.56 DR', -1234.56],
  ])('%s', (raw, expected) => expect(parseAmount(raw)).toBeCloseTo(expected))

  it.each(['--', '-', 'N/A', 'nil', ''])('treats %j as empty, not zero', (raw) =>
    expect(parseAmount(raw)).toBeNull(),
  )
})

describe('parseDate', () => {
  it('reads named months', () => {
    expect(parseDate('10 May 2023')).toBe('2023-05-10')
    expect(parseDate('05-Jan-2026')).toBe('2026-01-05')
  })

  it('uses the column format to disambiguate', () => {
    expect(parseDate('03/04/2025', 'DMY')).toBe('2025-04-03')
    expect(parseDate('03/04/2025', 'MDY')).toBe('2025-03-04')
    expect(parseDate('2025-03-04')).toBe('2025-03-04')
  })
})

describe('toCsv', () => {
  it('escapes commas, quotes and newlines in narrations', () => {
    const csv = toCsv([['HAIGHA & CO, LTD', 'say "hi"', 'a\nb']])
    expect(csv).toContain('"HAIGHA & CO, LTD"')
    expect(csv).toContain('"say ""hi"""')
    expect(csv).toContain('"a\nb"')
  })
})

describe('detectCurrency', () => {
  it('does not read the R in a name as rand', () => {
    expect(detectCurrency('Account Name: MUSTAPHA IBRAHIM\nAccount Number: 0123456789')).toBeUndefined()
  })

  it('still reads R and KSh in front of an amount', () => {
    expect(detectCurrency('Balance R 1,200.00')).toBe('ZAR')
    expect(detectCurrency('Closing KSh1,200')).toBe('KES')
    expect(detectCurrency('Total ₦5,000 USD')).toBe('USD')
  })
})
