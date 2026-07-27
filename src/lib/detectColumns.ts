import type { ColumnMap, ColumnRole, RawTable } from './types'
import { detectDateFormat, looksLikeDate, parseDate } from './dates'
import { isBlankCell, looksNumeric, parseAmount } from './money'

/** Below this the UI stops and asks the user to confirm the mapping. */
export const CONFIDENCE_FLOOR = 0.72

/*
 * Plurals matter more than they look: a "Lodgements" column silently failed to
 * match a `\blodgement\b` synonym, and every credit in the file disappeared.
 * Every noun here is therefore written with an optional trailing `s`.
 */
const SYNONYMS: Record<Exclude<ColumnRole, 'ignore'>, RegExp> = {
  date: /\b(dates?|posted|posting|txn\s*dates?|trans(action)?\.?\s*dates?|value\s*dates?)\b/i,
  description:
    /\b(descriptions?|narrations?|particulars|details|remarks?|memos?|references?|transactions?|notes?)\b/i,
  debit: /\b(debits?|withdrawals?|money\s*out|paid\s*out|outflows?|payments?\s*out|dr)\b/i,
  credit: /\b(credits?|deposits?|lodgements?|money\s*in|paid\s*in|inflows?|receipts?|cr)\b/i,
  // "value" must not swallow a "Value Date" column — that's a date, not money.
  amount: /\b(amounts?|value(?!\s*date)s?|sums?|transaction\s*amounts?)\b/i,
  balance: /\b(balances?|running\s*balance|balance\s*after|closing\s*balance)\b/i,
}

/**
 * Work out what each column means.
 *
 * Header names come first because they're explicit, but they're checked against
 * the actual cell contents — a column labelled "Amount" holding text is not an
 * amount. When there's no header at all, the roles are inferred from content
 * alone, which is what makes headerless exports work.
 */
export function detectColumns(table: RawTable): ColumnMap {
  const { rows, headerIndex } = table
  const body = rows.slice(headerIndex + 1).filter((r) => r.some(Boolean))
  const width = Math.max(...rows.map((r) => r.length), 0)
  if (!width || !body.length)
    return { roles: [], dateFormat: null, confidence: 0, notes: ['No data rows found.'] }

  const sample = body.slice(0, 400)
  const notes: string[] = []

  // --- per-column content profile ----------------------------------------
  const profile = Array.from({ length: width }, (_, c) => {
    const cells = sample.map((r) => r[c] ?? '')
    /*
     * Placeholders count as empty. A debit column is legitimately blank on
     * every credit row, and banks write that blank as "--" — treating those as
     * content makes a perfectly good money column look like text and get
     * ignored.
     */
    const filled = cells.filter((v) => !isBlankCell(v))
    const dates = filled.filter(looksLikeDate).length
    const numbers = filled.filter(looksNumeric).length
    const texty = filled.filter((v) => /[A-Za-z]{4}/.test(v) && !looksNumeric(v)).length
    const values = filled.map(parseAmount).filter((n): n is number => n !== null)
    const negatives = values.filter((n) => n < 0).length
    return {
      index: c,
      fill: filled.length / Math.max(sample.length, 1),
      dateRatio: dates / Math.max(filled.length, 1),
      numberRatio: numbers / Math.max(filled.length, 1),
      textRatio: texty / Math.max(filled.length, 1),
      negativeRatio: negatives / Math.max(values.length, 1),
      avgLength: filled.reduce((s, v) => s + v.length, 0) / Math.max(filled.length, 1),
    }
  })

  const header = headerIndex >= 0 ? rows[headerIndex] : null
  const roles: ColumnRole[] = Array(width).fill('ignore')
  const taken = new Set<ColumnRole>()

  const claim = (col: number, role: ColumnRole) => {
    roles[col] = role
    if (role !== 'ignore') taken.add(role)
  }

  // --- 1. header-driven, but only where the content agrees -----------------
  if (header) {
    for (const [role, re] of Object.entries(SYNONYMS) as [ColumnRole, RegExp][]) {
      if (taken.has(role)) continue
      const col = header.findIndex((h, i) => re.test(h ?? '') && roles[i] === 'ignore')
      if (col < 0) continue

      const p = profile[col]
      const agrees =
        role === 'date'
          ? p.dateRatio > 0.5
          : role === 'description'
            ? p.textRatio > 0.3 || p.avgLength > 8
            : p.numberRatio > 0.5

      if (agrees) claim(col, role)
      else notes.push(`Ignored header "${header[col]}" — the column's contents don't match.`)
    }
  }

  // --- 2. content-driven fill-in ------------------------------------------
  if (!taken.has('date')) {
    const col = profile
      .filter((p) => p.dateRatio > 0.7 && roles[p.index] === 'ignore')
      .sort((a, b) => b.dateRatio - a.dateRatio || a.index - b.index)[0]
    if (col) {
      claim(col.index, 'date')
      if (!header) notes.push(`Column ${col.index + 1} looks like dates.`)
    }
  }

  if (!taken.has('description')) {
    const col = profile
      .filter((p) => roles[p.index] === 'ignore' && p.textRatio > 0.3)
      .sort((a, b) => b.avgLength - a.avgLength)[0]
    if (col) claim(col.index, 'description')
  }

  const freeNumeric = () =>
    profile
      .filter((p) => roles[p.index] === 'ignore' && p.numberRatio > 0.6 && p.fill > 0.05)
      .sort((a, b) => a.index - b.index)

  /*
   * Balance is the giveaway column: it's filled on nearly every row, whereas a
   * debit or credit column is blank whenever the row is the other kind. It's
   * also almost always the rightmost money column.
   */
  if (!taken.has('balance')) {
    const candidates = freeNumeric()
    const col = candidates.filter((p) => p.fill > 0.9).at(-1)
    if (col && candidates.length > 1) {
      claim(col.index, 'balance')
      if (!header) notes.push(`Column ${col.index + 1} is filled on every row — treated as balance.`)
    }
  }

  if (!taken.has('debit') && !taken.has('credit') && !taken.has('amount')) {
    const candidates = freeNumeric()
    if (candidates.length >= 2) {
      // Two sparse money columns side by side = debit and credit.
      claim(candidates[0].index, 'debit')
      claim(candidates[1].index, 'credit')
      notes.push('Two money columns found — read as debit then credit.')
    } else if (candidates.length === 1) {
      claim(candidates[0].index, 'amount')
      if (candidates[0].negativeRatio > 0.05)
        notes.push('Single amount column with negatives — sign decides direction.')
      else notes.push('Single amount column — direction inferred from the description.')
    }
  }

  // --- 3. date format ------------------------------------------------------
  const dateCol = roles.indexOf('date')
  const detected =
    dateCol >= 0
      ? detectDateFormat(sample.map((r) => r[dateCol]))
      : { format: 'DMY' as const, confident: false }
  if (dateCol >= 0 && !detected.confident)
    notes.push(`Dates are ambiguous (e.g. 03/04/2025) — assuming ${detected.format}.`)

  // --- 4. confidence -------------------------------------------------------
  const hasDate = roles.includes('date')
  const hasMoney = roles.includes('debit') || roles.includes('credit') || roles.includes('amount')
  const hasDesc = roles.includes('description')

  let confidence = 0
  if (hasDate) confidence += 0.4
  if (hasMoney) confidence += 0.35
  if (hasDesc) confidence += 0.1
  if (header) confidence += 0.1
  if (detected.confident) confidence += 0.05
  confidence -= notes.filter((n) => n.startsWith('Ignored')).length * 0.15

  // How many rows would actually survive parsing? The honest final check.
  if (hasDate && hasMoney) {
    const usable = sample.filter((r) => {
      if (!parseDate(r[dateCol], detected.format)) return false
      return roles.some((role, i) =>
        role === 'debit' || role === 'credit' || role === 'amount'
          ? (parseAmount(r[i]) ?? 0) !== 0
          : false,
      )
    }).length
    const ratio = usable / sample.length
    confidence *= 0.5 + 0.5 * ratio
    if (ratio < 0.6)
      notes.push(`Only ${Math.round(ratio * 100)}% of rows parsed cleanly with this mapping.`)
  }

  return {
    roles,
    dateFormat: detected.format,
    confidence: Math.max(0, Math.min(1, confidence)),
    notes,
  }
}
