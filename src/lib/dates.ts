import type { DateFormat } from './types'

/**
 * Bank statements use every date convention there is, often without saying
 * which. These helpers parse a cell and, given a whole column, work out the
 * convention by finding the one that explains every value.
 */

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

const valid = (y: number, m: number, d: number) =>
  y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31

/** Parse one cell. `format` disambiguates numeric dates like 03/04/2025. */
export function parseDate(raw: unknown, format: DateFormat | null = null): string | null {
  if (raw instanceof Date && !Number.isNaN(+raw)) return raw.toISOString().slice(0, 10)

  const s = String(raw ?? '').trim()
  if (!s) return null

  // 2025-03-04 / 2025.03.04
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (ymd) {
    const [, y, m, d] = ymd.map(Number)
    return valid(y, m, d) ? iso(y, m, d) : null
  }

  // 10 May 2023 / 10-May-2023 / May 10, 2023
  const named = /(\d{1,2})[\s\-/]*([A-Za-z]{3,})[\s\-/,]*(\d{2,4})/.exec(s)
  if (named) {
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase())
    if (m >= 0) {
      const y = Number(named[3].length === 2 ? '20' + named[3] : named[3])
      const d = Number(named[1])
      if (valid(y, m + 1, d)) return iso(y, m + 1, d)
    }
  }
  const namedFirst = /([A-Za-z]{3,})[\s\-/]+(\d{1,2})[\s\-/,]+(\d{2,4})/.exec(s)
  if (namedFirst) {
    const m = MONTHS.indexOf(namedFirst[1].slice(0, 3).toLowerCase())
    if (m >= 0) {
      const y = Number(namedFirst[3].length === 2 ? '20' + namedFirst[3] : namedFirst[3])
      const d = Number(namedFirst[2])
      if (valid(y, m + 1, d)) return iso(y, m + 1, d)
    }
  }

  // 03/04/2025 — ambiguous without a format
  const num = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s)
  if (num) {
    const a = Number(num[1])
    const b = Number(num[2])
    const y = Number(num[3].length === 2 ? '20' + num[3] : num[3])
    const order = format ?? (a > 12 ? 'DMY' : b > 12 ? 'MDY' : 'DMY')
    const [d, m] = order === 'MDY' ? [b, a] : [a, b]
    return valid(y, m, d) ? iso(y, m, d) : null
  }

  return null
}

/** True when a cell holds a date in any recognised shape. */
export const looksLikeDate = (raw: unknown) => parseDate(raw) !== null

/**
 * Work out a column's convention. Only numeric `a/b/y` dates are ambiguous, so
 * evidence is gathered from values where one reading is impossible.
 */
export function detectDateFormat(values: unknown[]): { format: DateFormat; confident: boolean } {
  let dmy = 0
  let mdy = 0
  let ymd = 0

  for (const v of values) {
    const s = String(v ?? '').trim()
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) {
      ymd++
      continue
    }
    const num = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(s)
    if (!num) continue
    const a = Number(num[1])
    const b = Number(num[2])
    if (a > 12 && b <= 12) dmy++
    else if (b > 12 && a <= 12) mdy++
  }

  if (ymd > dmy && ymd > mdy) return { format: 'YMD', confident: true }
  if (dmy === 0 && mdy === 0) return { format: 'DMY', confident: false } // no evidence either way
  return dmy >= mdy ? { format: 'DMY', confident: mdy === 0 } : { format: 'MDY', confident: dmy === 0 }
}
