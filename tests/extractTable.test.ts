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

function workbook(sheets: Record<string, unknown[][]>, mutate?: (ws: XLSX.WorkSheet) => void) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    mutate?.(ws)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([bytes], 'statement.xlsx')
}

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
      workbook({ Summary: [['Total', '487,000.00']], Transactions: [...PREAMBLE, ...TABLE] }),
    )
    expect(t.rows[t.headerIndex]).toEqual(TABLE[0])
  })

  it('recovers a header hidden by a !ref that starts below it', async () => {
    const file = workbook({ Sheet1: [...PREAMBLE, ...TABLE] }, (ws) => {
      ws['!ref'] = 'A5:E7' // first data row onwards, as some exports declare
    })
    const t = await extractTable(file)
    expect(t.rows[t.headerIndex]).toEqual(TABLE[0])
    expect(t.preamble).toContain('Account Name: MUSTAPHA IBRAHIM')
  })

  it('rejects a file with no transactions', async () => {
    await expect(extractTable(workbook({ Notes: [['hello']] }))).rejects.toThrow(/transactions/)
  })
})
