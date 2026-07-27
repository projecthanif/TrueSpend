import type { ColumnMap, RawTable, Statement, StatementMeta, Txn } from './types'
import { parseDate } from './dates'
import { detectCurrency, parseAmount } from './money'
import { extractCounterparty } from './counterparty'

/** Words that mean money left the account, for single-amount-column layouts. */
const OUTBOUND = /\b(to|payment|purchase|pos|withdraw|withdrawal|debit|charge|fee|bill|airtime|data|transfer to|sent)\b/i
const INBOUND = /\b(from|received|deposit|credit|inflow|refund|reversal|salary|transfer from)\b/i

export function buildStatement(
  id: string,
  fileName: string,
  table: RawTable,
  map: ColumnMap,
  metaOverride?: Partial<StatementMeta>,
): Statement {
  const col = (role: string) => map.roles.indexOf(role as never)
  const dateCol = col('date')
  const descCol = col('description')
  const debitCol = col('debit')
  const creditCol = col('credit')
  const amountCol = col('amount')
  const balanceCol = col('balance')

  const meta: StatementMeta = { ...detectMeta(table), ...metaOverride }
  const warnings: string[] = [...map.notes]

  const txns: Txn[] = []
  let skipped = 0

  for (const row of table.rows.slice(table.headerIndex + 1)) {
    if (!row.some(Boolean)) continue

    const date = parseDate(row[dateCol], map.dateFormat)
    if (!date) {
      if (row.some((c) => c.trim())) skipped++
      continue
    }

    const description = (descCol >= 0 ? (row[descCol] ?? '') : '').replace(/\s+/g, ' ').trim()

    let amount: number | null = null
    let direction: 'in' | 'out' | null = null

    if (debitCol >= 0 || creditCol >= 0) {
      const debit = debitCol >= 0 ? parseAmount(row[debitCol]) : null
      const credit = creditCol >= 0 ? parseAmount(row[creditCol]) : null
      if (credit && Math.abs(credit) > 0) {
        amount = Math.abs(credit)
        direction = 'in'
      } else if (debit && Math.abs(debit) > 0) {
        amount = Math.abs(debit)
        direction = 'out'
      }
    } else if (amountCol >= 0) {
      const value = parseAmount(row[amountCol])
      if (value !== null && value !== 0) {
        amount = Math.abs(value)
        /*
         * A single amount column carries no direction of its own. A sign is the
         * strongest signal; failing that the wording decides, and failing that
         * we assume an outflow, which is what most single-column exports are.
         */
        direction =
          value < 0
            ? 'out'
            : INBOUND.test(description) && !OUTBOUND.test(description)
              ? 'in'
              : OUTBOUND.test(description)
                ? 'out'
                : 'in'
      }
    }

    if (amount === null || !direction) continue

    txns.push({
      date,
      sourceId: id,
      direction,
      amount,
      description,
      counterparty: extractCounterparty(description),
      balance: balanceCol >= 0 ? (parseAmount(row[balanceCol]) ?? undefined) : undefined,
      kind: 'external', // refined by classify()
      category: 'other',
    })
  }

  if (!txns.length)
    throw new Error(
      'No transactions could be read with this column mapping. Try adjusting it on the review screen.',
    )

  txns.sort((a, b) => a.date.localeCompare(b.date))
  if (skipped > txns.length * 0.2)
    warnings.push(`${skipped} row(s) had no readable date and were skipped.`)

  return {
    id,
    fileName,
    meta,
    map,
    table,
    txns,
    first: txns[0].date,
    last: txns[txns.length - 1].date,
    warnings,
  }
}

/**
 * Pull account details out of the preamble. Statements label these lines fairly
 * consistently even though everything else differs, and any mistake here is
 * correctable in the identity panel.
 */
function detectMeta(table: RawTable): StatementMeta {
  const text = table.preamble.join('\n')

  const grab = (re: RegExp) => {
    const m = re.exec(text)
    return m?.[1]?.replace(/\s+/g, ' ').trim() || undefined
  }

  /*
   * PDFs flatten a whole row into one line, so "ACCOUNT NAME: JANE DOE" often
   * arrives as "ACCOUNT NAME: JANE DOE Account Statement". Cut at the first
   * boilerplate word — an over-long name pollutes self-transfer detection,
   * which is the one thing that must not go wrong.
   */
  const trimBoilerplate = (s?: string) =>
    s
      ?.split(
        /\b(?:account|statement|period|currency|address|branch|customer|sort\s*code|iban|bvn|tel|email|page|date)\b/i,
      )[0]
      .replace(/[\s:,-]+$/, '')
      .trim() || undefined

  const name = trimBoilerplate(
    grab(/account\s*name\s*[:\-]?\s*\n?([A-Za-z][A-Za-z .'-]{3,60})/i) ??
      grab(/^\s*(?:name|customer)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{3,60})/im),
  )

  const number =
    grab(/account\s*(?:number|no\.?|#)\s*[:\-]?\s*\n?([\d-]{6,20})/i) ??
    grab(/\ba\/c\s*(?:no\.?)?\s*[:\-]?\s*([\d-]{6,20})/i)

  const bank = grab(/^([A-Z][A-Za-z& ]{3,40}(?:BANK|PLC|MFB|LIMITED))/m)

  return {
    accountName: name,
    accountNumber: number?.replace(/\D/g, ''),
    bank,
    currency: detectCurrency(text) ?? 'NGN',
  }
}
