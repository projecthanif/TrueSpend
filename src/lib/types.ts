export type Direction = 'in' | 'out'

/** What the money actually was — decided by `classify.ts`, not the parser. */
export type Kind =
  | 'external' //  real money in or out
  | 'self' //      moved between the owner's own accounts
  | 'internal' //  in-app housekeeping (auto-save, vaults, round-ups)
  | 'fee' //       bank charge, VAT, stamp duty, levy
  | 'reversal' //  refund / reversed entry

export type Category =
  | 'transfer'
  | 'card'
  | 'airtime'
  | 'data'
  | 'bills'
  | 'loan'
  | 'cash'
  | 'other'

export interface Txn {
  /** ISO date, `YYYY-MM-DD`. */
  date: string
  /** Which uploaded file this came from — the account identity. */
  sourceId: string
  direction: Direction
  amount: number
  /** Raw description straight from the statement, whitespace-collapsed. */
  description: string
  /** Best-effort counterparty name, title-cased. */
  counterparty: string
  /** Balance after the entry, when the statement reports one. */
  balance?: number
  kind: Kind
  category: Category
}

// ---------------------------------------------------------------------------
// Extraction — format-level, knows nothing about any particular bank
// ---------------------------------------------------------------------------

/** A rectangular grid of cell strings, plus any preamble text above it. */
export interface RawTable {
  /** Candidate header row index within `rows`, or -1 when none was found. */
  headerIndex: number
  rows: string[][]
  /** Lines above the table — account name, number, currency usually live here. */
  preamble: string[]
}

export type ColumnRole =
  | 'date'
  | 'description'
  | 'debit'
  | 'credit'
  | 'amount' // single signed column
  | 'balance'
  | 'ignore'

export interface ColumnMap {
  /** One role per column index in `RawTable.rows`. */
  roles: ColumnRole[]
  /** `null` means "infer per value". */
  dateFormat: DateFormat | null
  /** 0–1. Below `CONFIDENCE_FLOOR` the UI asks the user to confirm. */
  confidence: number
  /** Why the detector chose this, shown in the review UI. */
  notes: string[]
}

export type DateFormat = 'DMY' | 'MDY' | 'YMD'

export interface StatementMeta {
  accountName?: string
  accountNumber?: string
  bank?: string
  currency: string // ISO code where known, else the raw symbol
}

/** One uploaded file, fully interpreted and ready to classify. */
export interface Statement {
  id: string
  fileName: string
  meta: StatementMeta
  map: ColumnMap
  table: RawTable
  txns: Txn[]
  first: string
  last: string
  warnings: string[]
}

/** Who the user is — drives self-transfer detection. Editable in the UI. */
export interface Identity {
  /** Name variants across banks, e.g. "Mustapha Ibrahim", "Mustapha A Ibrahim". */
  names: string[]
  /** Account numbers the user owns; a match is conclusive evidence of self. */
  accountNumbers: string[]
}
