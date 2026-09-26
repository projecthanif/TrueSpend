import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { extractTable } from '../src/lib/extractTable'

const PREAMBLE = [['Account Name: MUSTAPHA IBRAHIM'], ['Account Number: 0123456789'], []]
const TABLE = [
  ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
  ['01/01/2025', 'SALARY FROM ACME LTD', '', '500,000.00', '500,000.00'],
  ['02/01/2025', 'AIRTIME MTN', '1,000.00', '', '499,000.00'],
  ['03/01/2025', 'POS PRCH 502079790072 SHOPRITE', '12,000.00', '', '487,000.00'],
]

function workbook(sheets: Record<string, unknown[][]>) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/**
 * Rewrite the first sheet's declared `<dimension>` without touching its cells —
 * what a lying export actually looks like on disk. (Setting `!ref` before
 * writing doesn't reproduce it: the writer drops cells outside the range.)
 */
function withDimension(bytes: ArrayBuffer, ref: string) {
  const zip = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' })
  const entry = XLSX.CFB.find(zip, '/xl/worksheets/sheet1.xml')!
  const xml = new TextDecoder().decode(entry.content as Uint8Array)
  entry.content = new TextEncoder().encode(xml.replace(/<dimension ref="[^"]+"/, `<dimension ref="${ref}"`)) as never
  return XLSX.CFB.write(zip, { fileType: 'zip', type: 'array' }) as ArrayBuffer
}

const file = (bytes: ArrayBuffer) => new File([bytes], 'statement.xlsx')

describe('extractTable', () => {
  it('reads a CSV with its preamble and header', async () => {
    const csv = [...PREAMBLE, ...TABLE].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const t = await extractTable(new File([csv], 'statement.csv'))
    expect(t.rows[t.headerIndex]).toEqual(TABLE[0])
    expect(t.preamble).toContain('Account Number: 0123456789')
    expect(t.rows.slice(t.headerIndex + 1)).toHaveLength(3)
  })

  it('picks the transaction sheet over a summary sheet', async () => {
    const t = await extractTable(
      file(workbook({ Summary: [['Total', '487,000.00']], Transactions: [...PREAMBLE, ...TABLE] })),
    )
    expect(t.rows[t.headerIndex]).toEqual(TABLE[0])
  })

  it('recovers a header hidden by a !ref that starts below it', async () => {
    // First data row onwards, as some exports declare.
    const t = await extractTable(file(withDimension(workbook({ Sheet1: [...PREAMBLE, ...TABLE] }), 'A5:E7')))
    expect(t.rows[t.headerIndex]).toEqual(TABLE[0])
    expect(t.preamble).toContain('Account Name: MUSTAPHA IBRAHIM')
  })

  it('rejects a file with no transactions', async () => {
    await expect(extractTable(file(workbook({ Notes: [['hello']] })))).rejects.toThrow(/transactions/)
  })
})
