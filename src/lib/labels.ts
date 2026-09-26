import type { Category, Kind } from './types'

export const CATEGORY_LABEL: Record<Category, string> = {
  transfer: 'Transfers out',
  card: 'Card & merchant',
  airtime: 'Airtime',
  data: 'Mobile data',
  bills: 'Bills & utilities',
  loan: 'Loan repayment',
  cash: 'Cash withdrawal',
  other: 'Other',
}

export const KIND_OPTION: Record<Kind, string> = {
  external: 'Counted',
  self: 'Own accounts',
  internal: 'Savings round trip',
  fee: 'Fee or levy',
  reversal: 'Reversal',
}
