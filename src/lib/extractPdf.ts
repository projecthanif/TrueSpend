import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { RawTable } from './types'
import { looksLikeDate, parseDate } from './dates'
import { looksNumeric } from './money'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface Item {
  x: number
  right: number
  text: string
}
interface Line {
  y: number
  page: number
  items: Item[]
  text: string
}

const NUMERIC_HEADER =
  /\b(debit|credit|withdrawal|withdrawals|deposit|deposits|lodgement|payment|amount|balance|money\s*(in|out)|dr|cr)\b/i
const ANY_HEADER =
  /\b(date|description|narration|particulars|details|remarks|reference|type|channel)\b/i

/** One token of a column header — "Balance After (₦)", "Trans. Time", "Value Date". */
const HEADER_WORD =
  /^(?:trans\.?|transaction|time|date|value|description|narration|particulars|details|remarks|reference|ref\.?|type|channel|debit|credit|withdrawals?|deposits?|lodgements?|payments?|amount|balance|money|in|out|dr|cr|after|before|no\.?|\(?(?:₦|\$|£|€|ngn|usd|gbp|eur|ghs|kes|zar)\)?|[/&()-])$/i

/**
 * PDF -> a rectangular grid.
 *
 * A PDF has no table structure, only glyphs at coordinates, so the columns are
 * recovered geometrically:
 *
 *   1. Group text items into visual lines by baseline.
 *   2. Treat lines that begin with a date as transaction rows.
 *   3. Cluster the x-positions of every number in those rows — each cluster is
 *      a money column. This is what lets a blank debit cell stay blank instead
 *      of being mistaken for the credit.
 *   4. Anything between the date and the first money column is the description;
 *      lines with no date and no numbers are wrapped continuations.
 */
export async function extractPdf(
  file: File,
  onPage?: (page: number, pages: number) => void,
): Promise<RawTable> {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const lines: Line[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    onPage?.(p, pdf.numPages)
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()

    const byBaseline = new Map<number, Item[]>()
    for (const raw of content.items as { str: string; width: number; transform: number[] }[]) {
      if (!raw.str.trim()) continue
      const y = Math.round(raw.transform[5])
      const key = [...byBaseline.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
      if (!byBaseline.has(key)) byBaseline.set(key, [])
      byBaseline.get(key)!.push(...splitItem(raw.str, raw.transform[4], raw.width || 0))
    }

    for (const [y, items] of [...byBaseline.entries()].sort((a, b) => b[0] - a[0])) {
      items.sort((a, b) => a.x - b.x)
      const text = items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim()
      if (text) lines.push({ y, page: p, items, text })
    }
  }

  if (!lines.length) throw new Error('No text found in this PDF — it may be a scan.')
  if (lines.filter(isRow).length < 3)
    throw new Error('Could not find dated transaction rows in this PDF.')

  /*
   * One PDF can hold several accounts — OPay puts the wallet and the savings
   * account back to back, each under its own header and with its columns in
   * different places. Clustered together, the savings balances land in the
   * wallet's credit column. Like a workbook's savings sheet, the smaller
   * tables are left out: they'd double-count the auto-save round trips.
   */
  const tables = splitTables(lines)
  const best = tables.reduce((a, b) => (b.rows > a.rows ? b : a))
  const notes: string[] = []
  for (const t of tables) {
    if (t === best || !t.rows) continue
    notes.push(
      `Skipped a separate table on ${pageSpan(t.lines)} (${t.rows.toLocaleString('en')} rows, ` +
        `likely another account) — using the one on ${pageSpan(best.lines)}.`,
    )
  }

  const firstRow = lines.findIndex(isRow)
  return {
    headerIndex: 0,
    rows: toGrid(best.lines),
    preamble: lines.slice(0, Math.max(firstRow, 0)).map((l) => l.text),
    notes,
  }
}

/** Steps 2–5 for one table: its own money columns, its own header. */
function toGrid(lines: Line[]): string[][] {
  // --- 2. which lines are transaction rows? -------------------------------
  const rowLines = lines.filter(isRow)
  if (rowLines.length < 3)
    throw new Error('Could not find dated transaction rows in this PDF.')

  // --- 3. cluster the money columns ---------------------------------------
  /*
   * Descriptions are full of stray digits — "MNFY 26", "NGN 39950 00". Treated
   * as money they invent phantom columns to the left of the real ones, which
   * then swallows the description. Amounts almost always carry two decimal
   * places, so that's the test; if a statement writes whole numbers instead,
   * we fall back to plain numeric detection.
   */
  const isMoney = (t: string) => looksNumeric(t) && /[.,]\d{2}$/.test(t.trim())
  const strict = rowLines.flatMap((l) => l.items.filter((i) => isMoney(i.text)))
  const useStrict = strict.length >= rowLines.length * 0.5
  const moneyItem = (text: string) => (useStrict ? isMoney(text) : looksNumeric(text))

  const centres = rowLines
    .flatMap((l) => l.items.filter((i) => moneyItem(i.text)))
    .map((i) => (i.x + i.right) / 2)
    .sort((a, b) => a - b)

  // A column must appear on a fair share of rows; a handful of hits is noise.
  const minSupport = Math.max(3, rowLines.length * 0.03)
  const clusters = clusterPositions(centres, 18)
    .filter((c) => c.count >= minSupport)
    .map((c) => c.centre)

  if (!clusters.length) throw new Error('Could not identify any amount columns in this PDF.')

  // Where does the description end? At the leftmost money column.
  const moneyStart = clusters[0] - 20

  // --- 4. name the columns from a header line, if there is one -------------
  const firstRowY = rowLines[0]
  const headerLine = lines
    .slice(0, lines.indexOf(firstRowY))
    .reverse()
    .find(
      (l) =>
        !isRow(l) &&
        (l.text.match(NUMERIC_HEADER)?.length ?? 0) >= 0 &&
        [...l.text.matchAll(/\b\w+\b/g)].length <= 14 &&
        (NUMERIC_HEADER.test(l.text) ? 1 : 0) + (ANY_HEADER.test(l.text) ? 1 : 0) >= 2,
    )

  /*
   * Headers are often set on two baselines — OPay raises "Balance After" a few
   * points above "Debit" and "Credit" — so labels just above or below count too.
   *
   * But only lines made purely of header words. Zenith prints an "Opening
   * Balance" row 11pt under its header; let in, its "Balance" became a fourth
   * label for three columns, the labels were then matched by geometry, and the
   * balance column was read as credits — every row came out as income.
   */
  const headerBand = headerLine
    ? lines.filter(
        (l) =>
          l.page === headerLine.page &&
          Math.abs(l.y - headerLine.y) <= 14 &&
          !isRow(l) &&
          (l === headerLine || l.items.every((i) => HEADER_WORD.test(i.text))),
      )
    : []
  const moneyLabels = headerBand
    .flatMap((l) => l.items.filter((i) => NUMERIC_HEADER.test(i.text)))
    .sort((a, b) => a.x - b.x)

  const header = ['Date', 'Description', ...labelColumns(moneyLabels, clusters)]

  // --- 5. emit rows --------------------------------------------------------
  const rows: string[][] = [header]
  let current: string[] | null = null

  for (const line of lines) {
    if (isRow(line)) {
      const cells = Array<string>(clusters.length).fill('')
      const desc: string[] = []
      let date = ''

      for (const item of line.items) {
        const centre = (item.x + item.right) / 2
        if (moneyItem(item.text) && centre >= moneyStart) {
          const idx = nearest(clusters, centre)
          cells[idx] = cells[idx] ? `${cells[idx]} ${item.text}`.trim() : item.text.trim()
        } else if (!date && parseDate(item.text)) {
          date = item.text.trim()
        } else if (centre < moneyStart) {
          desc.push(item.text)
        }
      }

      // A date split across items ("10", "May", "2023") lands in desc — recover it.
      if (!date) {
        const joined = desc.slice(0, 3).join(' ')
        if (parseDate(joined)) {
          date = joined
          desc.splice(0, 3)
        }
      }

      current = [date, desc.join(' ').replace(/\s+/g, ' ').trim(), ...cells]
      rows.push(current)
    } else if (
      current &&
      line.items.every((i) => !looksNumeric(i.text)) &&
      line.text.length < 90 &&
      !parseDate(line.text)
    ) {
      // Wrapped description continuation.
      current[1] = `${current[1]} ${line.text}`.replace(/\s+/g, ' ').trim()
    }
  }

  return rows
}

const isRow = (l: Line) => {
  const lead = l.items
    .slice(0, 3)
    .map((i) => i.text)
    .join(' ')
  return looksLikeDate(lead) && l.items.some((i) => looksNumeric(i.text))
}

/*
 * A table's column header: a date or time column and at least two money
 * columns. Two, so a wrapped description that mentions "payment" and "date"
 * can't pass for one and start a phantom table.
 */
const isTableHeader = (l: Line) =>
  !isRow(l) &&
  /\b(date|time)\b/i.test(l.text) &&
  new Set(l.items.filter((i) => NUMERIC_HEADER.test(i.text)).map((i) => i.text.toLowerCase()))
    .size >= 2 &&
  [...l.text.matchAll(/\b\w+\b/g)].length <= 16

/*
 * Cut the lines into tables at each header. A header repeated on every page
 * has the same money labels in the same places, so it continues its table
 * rather than starting a new one.
 */
function splitTables(lines: Line[]): { lines: Line[]; rows: number }[] {
  const layout = (l: Line) =>
    l.items
      .filter((i) => NUMERIC_HEADER.test(i.text))
      .map((i) => `${i.text.toLowerCase()}@${Math.round(i.x / 10)}`)
      .join(' ')

  const tables = new Map<string, Line[]>()
  let key = ''
  for (const line of lines) {
    if (isTableHeader(line)) key = layout(line)
    if (!tables.has(key)) tables.set(key, [])
    tables.get(key)!.push(line)
  }

  // Lines above the first header (the account summary) belong to the first table.
  const lead = tables.get('')
  if (lead && tables.size > 1) {
    tables.delete('')
    const [first, firstLines] = [...tables][0]
    tables.set(first, [...lead, ...firstLines])
  }

  return [...tables.values()].map((t) => ({ lines: t, rows: t.filter(isRow).length }))
}

function pageSpan(lines: Line[]): string {
  const pages = lines.map((l) => l.page)
  const [from, to] = [Math.min(...pages), Math.max(...pages)]
  return from === to ? `page ${from}` : `pages ${from}–${to}`
}

/**
 * pdf.js emits runs of glyphs, not cells — two adjacent table cells routinely
 * arrive as one item, e.g. `"0.00 29/09/2024"` is the credit *and* the value
 * date. Left whole, that string is neither a number nor a date and the credit
 * is silently lost.
 *
 * So every item is split on whitespace and each token given an x-range
 * interpolated from its character offset. Proportional fonts make this an
 * approximation, but column gaps are far wider than the error.
 */
function splitItem(text: string, x: number, width: number): Item[] {
  const trimmed = text.trimEnd()
  if (!trimmed.trim()) return []
  if (!/\s/.test(trimmed.trim()))
    return [{ x, right: x + width, text: trimmed.trim() }]

  const perChar = width / Math.max(trimmed.length, 1)
  const out: Item[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed))) {
    out.push({
      x: x + m.index * perChar,
      right: x + (m.index + m[0].length) * perChar,
      text: m[0],
    })
  }
  return out
}

/** 1-D clustering: positions within `tolerance` collapse to their mean. */
function clusterPositions(
  sorted: number[],
  tolerance: number,
): { centre: number; count: number }[] {
  const groups: number[][] = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last && v - last[last.length - 1] <= tolerance) last.push(v)
    else groups.push([v])
  }
  return groups.map((g) => ({
    centre: g.reduce((s, v) => s + v, 0) / g.length,
    count: g.length,
  }))
}

const nearest = (points: number[], v: number) =>
  points.reduce((best, p, i) => (Math.abs(p - v) < Math.abs(points[best] - v) ? i : best), 0)

/**
 * Match header labels to money columns. When the counts agree, left-to-right
 * order is more reliable than geometry — headers are often centred over
 * right-aligned figures. When they don't, fall back to whichever column each
 * label sits closest to, so a "Value Date" column between the money ones
 * doesn't shift every label along by one.
 */
function labelColumns(labels: Item[], clusters: number[]): string[] {
  // Deliberately not "Amount N": detectColumns would take that for a real header.
  const out = Array.from({ length: clusters.length }, (_, i) => `Column ${i + 3}`)
  if (!labels.length) return out

  if (labels.length === clusters.length) return labels.map((l) => l.text.trim())

  for (const label of labels) {
    const centre = (label.x + label.right) / 2
    const idx = clusters.reduce(
      (best, c, i) => (Math.abs(c - centre) < Math.abs(clusters[best] - centre) ? i : best),
      0,
    )
    if (out[idx].startsWith('Column ')) out[idx] = label.text.trim()
  }
  return out
}
