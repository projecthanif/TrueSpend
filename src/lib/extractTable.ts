import * as XLSX from 'xlsx'
import type { RawTable } from './types'
import { looksLikeDate } from './dates'
import { looksNumeric } from './money'

const HEADER_WORDS =
  /\b(date|description|narration|particulars|details|remarks|reference|debit|credit|withdrawal|deposit|lodgement|amount|balance|value|type|channel)\b/i

/**
 * XLSX / XLS / CSV -> a rectangular grid, with the header row located and any
 * preamble kept separately.
 *
 * Deliberately format-level: no bank names, no fixed offsets. The only
 * assumptions are that a statement is a table and that its header row, if
 * present, uses recognisable words.
 */
export async function extractTable(file: File): Promise<RawTable> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })

  // Score every sheet and keep the one that looks most like transactions.
  // Exports routinely carry summary or savings sheets that would double-count.
  let best: { rows: string[][]; score: number } | null = null

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue

    /*
     * Some exports declare a `!ref` that starts below the preamble, which
     * silently hides the header row and the account metadata. The cells are
     * still there, so force the range back to the origin.
     */
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
    range.s.r = 0
    range.s.c = 0

    const rows = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', range })
      .map((r) => r.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()))

    // A transaction sheet has many rows whose first few cells contain a date.
    const dated = rows.filter((r) => r.slice(0, 3).some(looksLikeDate)).length
    const score = dated + (HEADER_WORDS.test(name) ? 5 : 0)
    if (dated >= 3 && (!best || score > best.score)) best = { rows, score }
  }

  if (!best) throw new Error('No sheet in this file looks like a list of transactions.')

  const { rows } = best
  const headerIndex = findHeader(rows)

  return {
    headerIndex,
    rows,
    preamble: rows
      .slice(0, Math.max(headerIndex, 0))
      .flat()
      .filter(Boolean),
  }
}

function findHeader(rows: string[][]): number {
  let bestIdx = -1
  let bestScore = 1 // require at least two header-ish words

  // Only look near the top; a "header" 200 rows down is a page break, not a header.
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i]
    if (!row.some(Boolean)) continue
    // A real header row has words, not dates or money.
    if (row.some(looksLikeDate) || row.filter(looksNumeric).length > 1) continue

    const score = row.filter((c) => HEADER_WORDS.test(c)).length
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx
}
