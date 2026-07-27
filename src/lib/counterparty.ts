/**
 * Pull the other party's name out of a free-text description.
 *
 * Every bank writes these differently, but they share a shape: some routing
 * noise, a bank or scheme code, the name, and a narration. The strategy is to
 * strip what is provably noise and take the best of what's left, rather than
 * pattern-matching any one bank's format.
 */

/** Scheme, channel and direction markers — never the person on the other side. */
const ROUTING = new Set(
  `nip cip neft rtgs ach imps upi neft fps bacs sepa swift ussd pos atm web mob mobile
   app internet online trf tr ref rrn stan cr dr credit debit payment transfer transfer)
   inflow outflow value vat wd chg chrg comm nil na misc txn`
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * Card and POS lines bury the merchant behind a terminal reference:
 *   "MC LOC POS PRCH-502079790072--PAYCOM"
 * The reference digits are required, otherwise the keyword matches itself and
 * "Prch" ends up ranked as a top payee.
 */
const CARD_MERCHANT = /(?:PRCH|PURCHASE|POS)\s*-?\s*\d{4,}\s*-{0,2}\s*([A-Za-z][\w .'&-]{2,})/i

/** "…/FRM ADINDU EMMANUEL" — an explicit originator marker. Highest priority. */
const ORIGINATOR = /(?:\/|\b)FRM[\s:]+([A-Za-z][A-Za-z .'-]{2,})/i

/** "Transfer from X" / "Payment to X" — the name follows the preposition. */
const PREPOSITION = /\b(?:transfer|payment|paid|sent|received|trf|tfr)?\s*\b(?:from|to)\s+([A-Za-z][A-Za-z .'&-]{2,}.*)$/i

/** Trailing reference numbers and narration glued onto a name. */
const stripRef = (s: string) =>
  s
    .replace(/\s+FRM\b.*$/i, '')
    .replace(/\s*[\d*]{6,}.*$/, '') // long reference number and everything after
    .replace(/[\s;:,.\-|]+\d*$/, '')
    .trim()

const isRouting = (s: string) => {
  const words = s.toLowerCase().split(/[\s\-_]+/).filter(Boolean)
  return words.length > 0 && words.every((w) => ROUTING.has(w))
}

const title = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()

export function extractCounterparty(description: string): string {
  const d = description.replace(/\s+/g, ' ').trim()
  if (!d) return '—'

  // 1. An explicit originator marker always names the true sender.
  const frm = ORIGINATOR.exec(d)
  if (frm) return title(stripRef(frm[1]))

  // 2. Card and POS purchases put the merchant after the terminal reference.
  const card = CARD_MERCHANT.exec(d)
  if (card && card[1] && !isRouting(card[1])) return title(stripRef(card[1]))

  // 3. Otherwise work through the segments. Banks mix | / \ and ; as separators.
  const segments = d
    .split(/[|\\/;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !isRouting(s) && !/^[\d\s*.:()\-]+$/.test(s))

  // A short leading segment is a bank or scheme code (GTB, FBN, STBC…), not a name.
  const bankish = segments.length > 1 && segments[0].length <= 5
  let candidate = (bankish ? segments[1] : segments[0]) ?? ''

  /*
   * Only unwrap "from/to X" when it is the leading segment. In
   * "NIP/GTB/YAHAYA ADELEKE/NIP Transfer to MUSTAPHA IBRAHIM" the trailing
   * clause names the *beneficiary* — the account owner — while the real
   * counterparty sits in an earlier segment. Reading the clause there would
   * misfile inbound money from other people as a self-transfer.
   */
  const prep = PREPOSITION.exec(candidate || d)
  if (prep) candidate = prep[1]

  candidate = stripRef(candidate)

  // Drop a leading routing word that survived because it shared a segment.
  candidate = candidate.replace(
    /^(?:nip|cip|neft|rtgs|pos|atm|web|mob|ussd|trf|transfer|payment)\s+/i,
    '',
  )

  if (candidate && /[A-Za-z]{3}/.test(candidate)) return title(candidate.slice(0, 48))
  return title(d.slice(0, 40))
}
