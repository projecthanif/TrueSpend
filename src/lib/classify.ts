import type { Category, Identity, Kind, Statement, Txn } from './types'

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
  [/\b(loan|repayment|easemoni|okash|branch|fairmoney|carbon|borrow|credit\s*facility)\b/i, 'loan'],
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
}

export function classify(statements: Statement[], identity: Identity): Classified {
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

  const txns = statements
    .flatMap((s) => s.txns)
    .map((t) => ({
      ...t,
      kind: kindOf(t),
      category: t.direction === 'out' ? categorise(t.description) : ('transfer' as Category),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))

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
  if (currencies.length > 1)
    warnings.push(
      `Statements use different currencies (${currencies.join(', ')}). Totals mix them — set a single currency to compare like with like.`,
    )

  return {
    txns,
    statements,
    first: txns[0].date,
    last: txns[txns.length - 1].date,
    currency: currencies[0] ?? 'NGN',
    warnings,
    excluded,
  }
}
