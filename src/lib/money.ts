/**
 * Number and currency handling, shared by extraction and every view.
 *
 * Statements are wildly inconsistent: "1,234.56", "1.234,56", "(1,234.56)" for
 * negatives, "1,234.56 DR", "--" for empty. Everything funnels through here.
 */

const SYMBOLS: Record<string, string> = {
  '₦': 'NGN',
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '¥': 'JPY',
  '₹': 'INR',
  R: 'ZAR',
  '₵': 'GHS',
  'KSh': 'KES',
  '₨': 'PKR',
  '₩': 'KRW',
  '₺': 'TRY',
  '₽': 'RUB',
  '₪': 'ILS',
  '₱': 'PHP',
  '฿': 'THB',
}

const CODES = new Set([
  'NGN', 'USD', 'GBP', 'EUR', 'JPY', 'INR', 'ZAR', 'GHS', 'KES', 'UGX', 'TZS',
  'RWF', 'XOF', 'XAF', 'EGP', 'MAD', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY', 'HKD',
  'SGD', 'AED', 'SAR', 'PKR', 'BDT', 'LKR', 'PHP', 'THB', 'MYR', 'IDR', 'VND',
  'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'TRY', 'RUB', 'PLN', 'SEK', 'NOK',
  'DKK', 'CZK', 'HUF', 'RON', 'ILS', 'KRW', 'TWD',
])

export const CURRENCY_CHOICES = [...CODES].sort()

/** Find a currency in free text — an ISO code wins over a bare symbol. */
export function detectCurrency(text: string): string | undefined {
  const code = /\b([A-Z]{3})\b/g
  for (const m of text.matchAll(code)) if (CODES.has(m[1])) return m[1]
  for (const [sym, iso] of Object.entries(SYMBOLS)) {
    /*
     * A letter symbol only counts in front of a number. A bare "R" otherwise
     * matches the R in "IBRAHIM" or "Account Number" and labels every naira
     * statement as rand.
     */
    const found = /^[A-Za-z]+$/.test(sym)
      ? new RegExp(`\\b${sym}\\s?\\d`).test(text)
      : text.includes(sym)
    if (found) return iso
  }
  return undefined
}

/**
 * Parse a money cell. Returns `null` when the cell holds no number at all,
 * which is different from a genuine zero.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null

  let s = String(raw ?? '').trim()
  if (!s || s === '-' || s === '--' || s === 'N/A' || s === 'nil') return null

  // Trailing/leading DR or CR markers, and accounting-style parentheses.
  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (/\bDR\b/i.test(s)) sign = -1
  s = s.replace(/\b[CD]R\b/gi, '')

  // Strip currency symbols, codes and spaces — keep digits and separators.
  s = s.replace(/[^\d.,\-+]/g, '').trim()
  if (!s || !/\d/.test(s)) return null

  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1)
  }
  s = s.replace(/^\+/, '')

  /*
   * Decide which separator is decimal. "1.234,56" is European, "1,234.56" is
   * Anglo. Rule: whichever separator appears last is the decimal one — unless
   * it groups exactly three digits and appears more than once, which makes it a
   * thousands separator ("1.234.567").
   */
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let decimalAt = -1
  if (lastDot >= 0 && lastComma >= 0) decimalAt = Math.max(lastDot, lastComma)
  else if (lastDot >= 0) decimalAt = lastDot
  else if (lastComma >= 0) decimalAt = lastComma

  if (decimalAt >= 0) {
    const sep = s[decimalAt]
    const tail = s.slice(decimalAt + 1)
    const occurrences = s.split(sep).length - 1
    const isGrouping = tail.length === 3 && (occurrences > 1 || lastDot < 0 !== (lastComma < 0))
    if (tail.length === 3 && occurrences > 1) {
      s = s.replace(/[.,]/g, '')
    } else if (isGrouping && lastDot >= 0 && lastComma >= 0) {
      s = s.replace(/[.,]/g, '')
    } else {
      s = s.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + tail.replace(/[.,]/g, '')
    }
  }

  const n = Number(s)
  return Number.isFinite(n) ? sign * n : null
}

/** Cells banks use to mean "nothing here". Not the same as a zero. */
export const isBlankCell = (raw: unknown) => {
  const s = String(raw ?? '').trim()
  return s === '' || s === '-' || s === '--' || s === '—' || /^(n\/?a|nil|null)$/i.test(s)
}

/**
 * True when a cell looks like money rather than a date, a reference, or prose.
 *
 * Strict about letters on purpose: `"10 May 2023"` survives a naive digit-strip
 * as `102023`, which is how a value-date column ends up being summed as if it
 * were an amount.
 */
export function looksNumeric(raw: unknown): boolean {
  if (raw instanceof Date) return false
  const s = String(raw ?? '').trim()
  if (isBlankCell(s)) return false

  // Letters disqualify, except a trailing DR/CR marker.
  if (/[A-Za-z]/.test(s.replace(/\b[CD]R\b/gi, ''))) return false

  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) return false // ISO date
  if (/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(s)) return false // slashed date
  if (/^\d{9,}$/.test(s)) return false // long unformatted reference number
  if (/\d\s+\d/.test(s)) return false // two numbers in one cell — not a single amount

  return parseAmount(s) !== null
}

export function makeFormatters(currency: string, locale = 'en-NG') {
  const symbol = (() => {
    try {
      return (
        new Intl.NumberFormat(locale, { style: 'currency', currency })
          .formatToParts(0)
          .find((p) => p.type === 'currency')?.value ?? currency
      )
    } catch {
      return currency
    }
  })()

  const full = (n: number) =>
    symbol + Math.round(n).toLocaleString(locale, { maximumFractionDigits: 0 })

  const short = (n: number) => {
    const a = Math.abs(n)
    if (a >= 1e9) return `${symbol}${(n / 1e9).toFixed(2)}b`
    if (a >= 1e6) return `${symbol}${(n / 1e6).toFixed(2)}m`
    if (a >= 1e3) return `${symbol}${Math.round(n / 1e3)}k`
    return `${symbol}${Math.round(n)}`
  }

  return { symbol, full, short }
}

export type Formatters = ReturnType<typeof makeFormatters>
