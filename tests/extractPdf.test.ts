import { describe, expect, it, vi } from 'vitest'

/*
 * pdf.js's default build needs Node 22 (`Iterator`, `Promise.withResolvers`);
 * the legacy build runs anywhere. The browser still gets the modern one.
 */
;(Promise as unknown as { withResolvers?: unknown }).withResolvers ??= () => {
  let resolve!: (v: unknown) => void
  let reject!: (e: unknown) => void
  const promise = new Promise((a, b) => ((resolve = a), (reject = b)))
  return { promise, resolve, reject }
}
vi.mock('pdfjs-dist', async () => await import('pdfjs-dist/legacy/build/pdf.mjs'))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href,
}))

const { extractPdf } = await import('../src/lib/extractPdf')
const { detectColumns } = await import('../src/lib/detectColumns')
const { buildStatement } = await import('../src/lib/buildStatement')

type Text = [x: number, y: number, text: string]

/** A minimal text-layer PDF: one Helvetica 8pt string per `Text`, page by page. */
function pdf(pages: Text[][]): File {
  const esc = (s: string) => s.replace(/[()\\]/g, '\\$&')
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const kids: string[] = []
  for (const texts of pages) {
    const stream = texts.map(([x, y, s]) => `BT /F1 8 Tf ${x} ${y} Td (${esc(s)}) Tj ET`).join('\n') + '\n'
    kids.push(`${objs.length + 1} 0 R`)
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objs.length + 2} 0 R >>`)
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new File([out], 'statement.pdf', { type: 'application/pdf' })
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 })
/** Right-align a figure at `right`, as statements do (Helvetica digits ≈ 0.556em). */
const right = (edge: number, y: number, s: string): Text => [Math.round(edge - s.length * 4.45), y, s]

async function read(file: File) {
  const table = await extractPdf(file)
  const map = detectColumns(table)
  return { table, map, statement: buildStatement('s', file.name, table, map) }
}

/** Every balance equals the previous one plus this row's credit minus its debit. */
function reconciles(txns: { direction: string; amount: number; balance?: number }[]) {
  return txns.every((t, i) => {
    if (!i) return true
    const signed = t.direction === 'in' ? t.amount : -t.amount
    return Math.abs(t.balance! - txns[i - 1].balance! - signed) < 0.01
  })
}

// Debits and credits alternate so a mix-up shows in both directions.
const ENTRIES = [
  { debit: 0, credit: 50_000 },
  { debit: 1_200, credit: 0 },
  { debit: 15_750.5, credit: 0 },
  { debit: 0, credit: 3_000 },
  { debit: 999.99, credit: 0 },
  { debit: 0, credit: 120_000 },
]

describe('extractPdf layouts', () => {
  /*
   * Zenith: labels left-aligned, figures right-aligned ~40pt to their right,
   * both money cells always printed (0.00 for the empty side), a Value Date
   * column between Credit and Balance, and an "Opening Balance" row set just
   * 11pt under the header — which once passed for part of it.
   */
  it('reads a Zenith-style statement with an Opening Balance row under the header', async () => {
    const texts: Text[] = [
      [52, 760, 'ACCOUNT NAME: JANE ADA DOE Account Statement'],
      [52, 748, 'CURRENCY: NGN ACCOUNT No.: 2012345678'],
      [52, 604, 'DATE'], [111, 604, 'DESCRIPTION'], [265, 604, 'DEBIT'], [339, 604, 'CREDIT'],
      [413, 604, 'VALUE DATE'], [473, 604, 'BALANCE'],
      [111, 593, 'Opening Balance'], right(340, 593, '0.00'), right(420, 593, '0.00'), right(545, 593, '0.00'),
    ]
    let balance = 0
    ENTRIES.forEach((e, i) => {
      const y = 570 - i * 22
      const date = `0${i + 1}/10/2024`
      balance += e.credit - e.debit
      texts.push([52, y, date], [111, y, e.credit ? 'NIP CR/MOB/JOHN SMITH' : 'POS PURCHASE SHOP'])
      texts.push(right(340, y, money(e.debit)), right(420, y, money(e.credit)), [413 + 30, y, date], right(545, y, money(balance)))
    })

    const { table, map, statement } = await read(pdf([texts]))
    expect(table.rows[0]).toEqual(['Date', 'Description', 'DEBIT', 'CREDIT', 'BALANCE'])
    expect(map.roles).toEqual(['date', 'description', 'debit', 'credit', 'balance'])
    expect(statement.txns.map((t) => t.direction)).toEqual(ENTRIES.map((e) => (e.credit ? 'in' : 'out')))
    expect(reconciles(statement.txns)).toBe(true)
  })

  /*
   * OPay: "Balance After" is raised 6pt above Debit/Credit and its "(₦)" sits
   * 6pt below, so the header spans three baselines and must still be read as
   * one. Account name and number are labelled on one row, valued on the next.
   */
  it('reads an OPay-style statement with a header on three baselines', async () => {
    const texts: Text[] = [
      [71, 790, 'Account Name Account Number'],
      [71, 778, 'JANE ADA DOE 8012345678'],
      [71, 700, 'Trans. Time'], [130, 700, 'Value Date'], [176, 700, 'Description'],
      [308, 700, 'Debit'], [330, 700, '(₦)'], [346, 700, 'Credit'], [372, 700, '(₦)'],
      [384, 706, 'Balance After'], [384, 694, '(₦)'], [440, 700, 'Channel'], [480, 700, 'Transaction Reference'],
    ]
    let balance = 0
    ENTRIES.forEach((e, i) => {
      const y = 670 - i * 22
      balance += e.credit - e.debit
      texts.push([71, y, `${10 + i} May 2023`], [176, y, e.credit ? 'Transfer from John Smith' : 'Airtime'])
      texts.push(e.debit ? right(335, y, money(e.debit)) : [320, y, '--'], e.credit ? right(378, y, money(e.credit)) : [360, y, '--'])
      texts.push(right(425, y, money(balance)), [440, y, 'Mobile'], [480, y, `2305${i}0123456789012345`])
    })

    const { map, statement } = await read(pdf([texts]))
    expect(map.roles).toEqual(['date', 'description', 'debit', 'credit', 'balance'])
    expect(statement.txns.map((t) => t.direction)).toEqual(ENTRIES.map((e) => (e.credit ? 'in' : 'out')))
    expect(reconciles(statement.txns)).toBe(true)
    // Owner details are what self-transfer detection runs on.
    expect(statement.meta).toMatchObject({ accountName: 'JANE ADA DOE', accountNumber: '8012345678' })
  })
})
