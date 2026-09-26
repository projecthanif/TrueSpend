import type { Category, Identity, Kind, Overrides, Statement, Txn } from './types'

/**
 * The single most important step in the whole app.
 *
 * A raw statement massively overstates both income and spending, because the
 * same unit of money is counted several times as it moves around:
 *
 *   Bank -> wallet -> savings vault -> back out -> purchase
 *   five statement entries, one actual purchase
 *
 * Everything that isn't money crossing the boundary of *all* the user's
 * accounts gets tagged here so the dashboard can leave it out.
 */

/** Bank charges, taxes and levies — real money, but not spending decisions. */
const FEE =
  /\b(nip\s*charge|charge\s*\+?\s*vat|transfer\s*(charge|fee)|sms\s*(charge|subscription|alert|notification)|stamp\s*duty|(electronic\s*)?money\s*transfer\s*levy|with?holding\s*tax|account\s*maint|card\s*(issuance|maint)|maintenance\s*fee|service\s*charge|cot\b|ussd\s*charge|commission|\bvat\b|excise)\b/i

const REVERSAL = /\b(rvsl|rsvl|reversal|reversed|refund|chargeback|declined)\b/i

/**
 * In-app housekeeping: money moving between a wallet and its own savings or
 * round-up pockets. Named generically because every fintech has its own brand
 * for the same idea.
 */
const INTERNAL =
  /\b(auto[- ]?save|autosave|save\s*(to|from)|safe\s*box|safebox|spend\s*&?\s*save|round[- ]?up|vault|pocket|goal\s*(deposit|withdrawal)|wallet\s*(top[- ]?up|funding)\s*from\s*savings|interest\s*earned|owealth|piggy)\b/i

const CATEGORY_RULES: [RegExp, Category][] = [
  [/\b(airtime|recharge|top[- ]?up\s*(mtn|glo|airtel|9mobile)|vtu)\b/i, 'airtime'],
  [/\b(mobile\s*data|data\s*(bundle|plan|purchase|sub))\b/i, 'data'],
  [/\b(card\s*payment|pos\s*prch|web\s*prch|mc\s*loc|visa|mastercard|merchant|checkout|purchase|prch)\b/i, 'card'],
  [/\b(electric|power|dstv|gotv|startimes|netflix|spotify|water|cable|tv\s*sub|utilit|rent|insurance|betting|school\s*fee)\b/i, 'bills'],
  /*
   * "Branch" and "Carbon" are lenders, but "branch" is also in ordinary
   * narrations ("Lagos branch"), so those two only count in context.
   */
  [/\b(loan|repayment|easemoni|okash|fairmoney|getcarbon|carbon\s*(loan|repay)|branch\s*(international|loan|repay)|borrow|credit\s*facility)\b/i, 'loan'],
  [/\b(atm|cash\s*(out|withdraw)|withdrawal\s*agent|cardless)\b/i, 'cash'],
  [/\b(transfer|nip|cip|neft|rtgs|imps|upi|trf|sent\s*to|payment\s*to)\b/i, 'transfer'],
]

function categorise(desc: string): Category {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(desc)) return cat
  return 'other'
}

/**
 * Decides whether a counterparty is really the account owner.
 *
 * Built from the union of every statement's account name plus any aliases the
 * user added, because the same person is "MUSTAPHA IBRAHIM" at one bank and
 * "MUSTAPHA ALHAJI IBRAHIM" at another. Matching on one spelling alone lets
 * self-transfers through as real income.
 *
 * A name counts as the owner when every one of its tokens belongs to the owner's
 * token set *and* it carries one of the owner's leading names. That keeps
 * "Mustapha" and "Mustapha Alhaji Ibrahim" in, while "Mustapha Liman Mohammed"
 * stays external.
 */
export function makeSelfMatcher(identity: Identity) {
  const tokenise = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)

  const names = identity.names.filter(Boolean)
  const owned = new Set(names.flatMap(tokenise))
  const firsts = new Set(names.map((n) => tokenise(n)[0]).filter(Boolean))
  const accounts = identity.accountNumbers
    .map((a) => a.replace(/\D/g, ''))
    .filter((a) => a.length >= 6)

  /**
   * `ownAccount` is the account this statement belongs to, and it must be
   * excluded from the number check. Banks print your own account number on
   * airtime top-ups and bill payments — "Airtime | 9061887329 | MTN" is
   * spending, not a transfer to yourself. Only a *different* account of yours
   * appearing in the description means money moved between your accounts.
   */
  return (candidate: string, fullDescription = '', ownAccount = '') => {
    const others = accounts.filter((a) => a !== ownAccount.replace(/\D/g, ''))
    if (others.length) {
      const digits = fullDescription.replace(/\D/g, '')
      if (others.some((a) => digits.includes(a))) return true
    }

    if (!owned.size) return false
    const tokens = tokenise(candidate)
    if (!tokens.length || tokens.length > owned.size) return false
    // Name order carries meaning: "Mustapha Ibrahim" is the owner,
    // "Ibrahim Mustapha" is somebody else.
    if (!firsts.has(tokens[0])) return false
    return tokens.every((t) => owned.has(t))
  }
}

/** Names and account numbers the statements themselves suggest. */
export function suggestIdentity(statements: Statement[]): Identity {
  return {
    names: [...new Set(statements.map((s) => s.meta.accountName).filter(Boolean) as string[])],
    accountNumbers: [
      ...new Set(statements.map((s) => s.meta.accountNumber).filter(Boolean) as string[]),
    ],
  }
}

export interface Classified {
  txns: Txn[]
  statements: Statement[]
  first: string
  last: string
  currency: string
  warnings: string[]
  /** Totals for the amounts deliberately left out of every chart. */
  excluded: Record<Kind, number>
  /** Ids of transactions whose kind or category came from a user override. */
  overridden: Set<string>
}

export const NO_OVERRIDES: Overrides = { byTxn: {}, byCounterparty: {} }

export interface CurrencyGroup {
  currency: string
  statements: Statement[]
  txns: number
}

/**
 * Statements split by currency, largest first.
 *
 * Amounts in different currencies are never added together. Converting would
 * need a rate for every transaction date, which means fetching one — and the
 * app promises never to go online with anything the user gives it. So each
 * currency gets its own dashboard instead of one wrong total.
 */
export function currencyGroups(statements: Statement[]): CurrencyGroup[] {
  const m = new Map<string, CurrencyGroup>()
  for (const s of statements) {
    const g = m.get(s.meta.currency) ?? { currency: s.meta.currency, statements: [], txns: 0 }
    g.statements.push(s)
    g.txns += s.txns.length
    m.set(s.meta.currency, g)
  }
  return [...m.values()].sort((a, b) => b.txns - a.txns || a.currency.localeCompare(b.currency))
}

const DAY = 86_400_000
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY

/** How far back a reversal may point to the entry it cancels. */
const REVERSAL_WINDOW_DAYS = 14

/**
 * Drops entries that more than one statement reports.
 *
 * Uploading `Jan-Jun` and `Mar-Dec` for the same account would otherwise count
 * March to June twice. Two rows are the same entry when the account, date,
 * direction, amount, description and balance all agree.
 *
 * Identical rows *within* one file are legitimate (two ₦500 airtime top-ups on
 * the same day), so this is a multiset comparison: a later file only loses as
 * many copies of a row as an earlier file already contributed.
 */
function dedupe(statements: Statement[]): { txns: Txn[]; dropped: number } {
  const seen = new Map<string, number>()
  const txns: Txn[] = []
  let dropped = 0

  for (const s of statements) {
    // Without an account number there's no evidence two files are one account.
    const account = s.meta.accountNumber || s.id
    const local = new Map<string, number>()
    for (const t of s.txns) {
      const key = [account, t.date, t.direction, t.amount.toFixed(2), t.description, t.balance ?? ''].join('|')
      const n = (local.get(key) ?? 0) + 1
      local.set(key, n)
      if (n <= (seen.get(key) ?? 0)) dropped++
      else txns.push(t)
    }
    for (const [key, n] of local) seen.set(key, Math.max(seen.get(key) ?? 0, n))
  }
  return { txns, dropped }
}

/**
 * A reversal only cancels half of the picture. The refund itself is excluded,
 * but the debit it reverses would stay in "money out" — a failed ₦50k transfer
 * that bounced back would still read as ₦50k spent. So each reversal takes the
 * nearest earlier external entry on the same account, in the opposite
 * direction and for the same amount, out of the totals with it.
 */
function pairReversals(txns: Txn[], locked: Set<string>) {
  const taken = new Set<string>()
  for (const r of txns) {
    if (r.kind !== 'reversal') continue
    let match: Txn | undefined
    for (const t of txns) {
      if (t.date > r.date) break // sorted by date
      if (
        t.kind === 'external' &&
        !locked.has(t.id) &&
        !taken.has(t.id) &&
        t.sourceId === r.sourceId &&
        t.direction !== r.direction &&
        Math.abs(t.amount - r.amount) < 0.005 &&
        daysBetween(t.date, r.date) <= REVERSAL_WINDOW_DAYS
      )
        match = t // keep scanning: the latest candidate is the likeliest
    }
    if (match) {
      taken.add(match.id)
      match.kind = 'reversal'
    }
  }
}

export function classify(
  statements: Statement[],
  identity: Identity,
  overrides: Overrides = NO_OVERRIDES,
): Classified {
  if (!statements.length) throw new Error('No statements to classify.')

  const isSelf = makeSelfMatcher(identity)
  const ownAccountOf = new Map(statements.map((s) => [s.id, s.meta.accountNumber ?? '']))

  const kindOf = (t: Txn): Kind => {
    const d = t.description
    if (REVERSAL.test(d)) return 'reversal'
    if (FEE.test(d)) return 'fee'
    if (INTERNAL.test(d)) return 'internal'

    const own = ownAccountOf.get(t.sourceId) ?? ''

  /*
     * An explicit originator marker names the true sender, which matters when
     * the owner's own name also appears as the beneficiary.
     */
    const frm = /(?:\/|\b)FRM[\s:]+([^/|]+)/i.exec(d)
    if (frm) return isSelf(frm[1].trim(), d, own) ? 'self' : 'external'

    return isSelf(t.counterparty, d, own) ? 'self' : 'external'
  }

  const { txns: unique, dropped } = dedupe(statements)
  const overridden = new Set<string>()
  const lockedKind = new Set<string>()

  const txns = unique
    .map((t) => {
      const patch = { ...overrides.byCounterparty[t.counterparty], ...overrides.byTxn[t.id] }
      if (patch.kind || patch.category) overridden.add(t.id)
      if (patch.kind) lockedKind.add(t.id)
      return {
        ...t,
        kind: patch.kind ?? kindOf(t),
        category:
          t.direction === 'out'
            ? (patch.category ?? categorise(t.description))
            : ('transfer' as Category),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))

  // A kind the user set by hand is never second-guessed by pairing.
  pairReversals(txns, lockedKind)

  const excluded: Record<Kind, number> = {
    external: 0,
    self: 0,
    internal: 0,
    fee: 0,
    reversal: 0,
  }
  for (const t of txns) if (t.kind !== 'external') excluded[t.kind] += t.amount

  // Mixing currencies would silently add dollars to naira, so say so.
  const currencies = [...new Set(statements.map((s) => s.meta.currency))]
  const warnings = statements.flatMap((s) => s.warnings.map((w) => `${s.fileName}: ${w}`))
  if (dropped)
    warnings.push(
      `${dropped} entr${dropped === 1 ? 'y was' : 'ies were'} in more than one statement and counted once.`,
    )
  if (currencies.length > 1)
    warnings.push(
      `Statements use different currencies (${currencies.join(', ')}) and these totals add them together. Classify one currency at a time — see currencyGroups().`,
    )

  return {
    txns,
    statements,
    first: txns[0].date,
    last: txns[txns.length - 1].date,
    currency: currencies[0] ?? 'NGN',
    warnings,
    excluded,
    overridden,
  }
}
