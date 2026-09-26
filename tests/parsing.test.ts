import { describe, expect, it } from 'vitest'
import { detectCurrency, makeFormatters, parseAmount } from '../src/lib/money'
import { detectDateFormat, parseDate } from '../src/lib/dates'
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

describe('detectDateFormat', () => {
  it('is confident when every month is named', () =>
    expect(detectDateFormat(['10 May 2023', '03 Apr 2024'])).toEqual({ format: 'DMY', confident: true }))

  it('still flags numeric dates that could go either way', () =>
    expect(detectDateFormat(['03/04/2025', '05/06/2025']).confident).toBe(false))
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

describe('formatters', () => {
  const { full, short } = makeFormatters('NGN')

  it('puts the sign before the symbol', () => {
    expect(full(-118479)).toBe('−₦118,479')
    expect(short(-200000)).toBe('−₦200k')
    expect(short(-2_500_000)).toBe('−₦2.50m')
  })

  it('leaves positives and zero unsigned', () => {
    expect(full(355383)).toBe('₦355,383')
    expect(full(-0.4)).toBe('₦0')
    expect(short(950)).toBe('₦950')
  })
})
