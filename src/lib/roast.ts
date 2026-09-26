import type { Aggregates } from './aggregate'
import type { Classified } from './classify'
import type { Formatters } from './money'
import type { Txn } from './types'

/**
 * Playful commentary on spending habits, built from the same numbers the
 * charts use. Everything is template-driven and runs locally — no statement
 * text ever leaves the browser to be "roasted" by a model.
 *
 * Rules the templates follow:
 *   - roast habits, never how much someone earns
 *   - every line is backed by a number the user can check (`evidence`)
 *   - when the statements look like financial strain, stay gentle
 */

export type Heat = 'mild' | 'medium' | 'spicy'
export const HEATS: Heat[] = ['mild', 'medium', 'spicy']

export interface Roast {
  id: string
  heat: Heat
  /** 0–1, how unusual the pattern is. Picks which roasts make the cut. */
  score: number
  line: string
  evidence: string
  tip: string
}

export interface RoastSet {
  roasts: Roast[]
  compliment: string
  tip?: string
  /** True when strain was detected and the heat was capped at mild, unless unlocked. */
  softened: boolean
}

type Lines = Record<Heat, string[]>

interface Candidate {
  id: string
  score: number
  lines: Lines
  evidence: string
  tip: string
  /** Skipped entirely when the statements show strain. */
  sensitive?: boolean
}

// Payees that are nobody's business to joke about, or that nobody chooses:
// health, faith, education, bereavement, and the rent-and-tax necessities.
const OFF_LIMITS =
  /hospital|clinic|pharm|medic|health|dental|lab(oratory)?s?\b|church|mosque|ministr|tithe|zakat|school|college|university|funeral|burial|\brent|landlord|lease|\btax\b|\bfirs\b|insurance|electric|disco\b|water/i

const DAY = 86_400_000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const days = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY)
const pct = (n: number) => `${Math.round(n * 100)}%`
const clamp = (n: number) => Math.max(0, Math.min(1, n))

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------------------
// Detectors — each returns a candidate, or null when the pattern isn't there
// ---------------------------------------------------------------------------

function feeBleed(c: Classified, fmt: Formatters): Candidate | null {
  const fees = c.txns.filter((t) => t.kind === 'fee' && t.direction === 'out')
  const total = fees.reduce((s, t) => s + t.amount, 0)
  if (fees.length < 5 || total <= 0) return null
  const f = fmt.full(total)
  const n = fees.length
  return {
    id: 'fees',
    score: clamp(n / 60),
    evidence: `${n} charges totalling ${f}`,
    tip: 'Check whether SMS alerts and card maintenance can be switched off or moved to a cheaper account tier.',
    lines: {
      mild: [`Your bank quietly collected ${f} in charges. Consider it a very expensive friendship.`],
      medium: [
        `The bank made ${f} off you in ${n} little charges. They should send you a Christmas hamper.`,
        `${n} bank charges, ${f} gone. You're not a customer, you're a revenue stream.`,
      ],
      spicy: [
        `${f} in fees. Your bank's end-of-year party has your name on a table.`,
        `You paid ${f} for the privilege of being charged ${n} times. Stockholm syndrome, but banking.`,
      ],
    },
  }
}

function airtimeDrip(spend: Txn[], fmt: Formatters): Candidate | null {
  const top = spend.filter((t) => t.category === 'airtime' || t.category === 'data')
  if (top.length < 15) return null
  const total = top.reduce((s, t) => s + t.amount, 0)
  const n = top.length
  const f = fmt.full(total)
  return {
    id: 'airtime',
    score: clamp(n / 120),
    evidence: `${n} airtime and data top-ups, ${f} in total`,
    tip: `One monthly data plan instead of ${n} top-ups usually works out cheaper — and saves you ${n} trips to the app.`,
    lines: {
      mild: [`${n} airtime and data top-ups. You and your network provider are very close.`],
      medium: [
        `You topped up ${n} times. That's not a phone plan, that's a lifestyle.`,
        `${n} recharges for ${f}. Your SIM card has a better savings habit than you do.`,
      ],
      spicy: [
        `${n} top-ups. At this point your network provider should list you as a shareholder.`,
        `${f} on airtime and data, one small panic at a time.`,
      ],
    },
  }
}

function loyalCustomer(agg: Aggregates, fmt: Formatters): Candidate | null {
  const top = agg.payees.find((p) => p.name !== '—' && !OFF_LIMITS.test(p.name))
  if (!top || agg.totals.spend <= 0) return null
  const share = top.amount / agg.totals.spend
  if (share < 0.08 || top.txns < 3) return null
  const f = fmt.full(top.amount)
  return {
    id: 'loyal',
    score: clamp(share * 2.5),
    evidence: `${top.name}: ${f} over ${top.txns} payments, ${pct(share)} of spend`,
    tip: `Look at what the ${top.txns} payments to ${top.name} were for — if it's habit rather than need, a monthly cap goes a long way.`,
    lines: {
      mild: [`${top.name} received ${pct(share)} of your spending. They probably know your name.`],
      medium: [
        `${top.name} got ${pct(share)} of everything you spent. At this point you're an investor.`,
        `${top.txns} payments to ${top.name}. Put a ring on it already.`,
      ],
      spicy: [
        `${f} to ${top.name}. They should name a wing of the building after you.`,
        `${top.name} took ${pct(share)} of your money. That's not loyalty, that's a hostage situation.`,
      ],
    },
  }
}

function revolvingVault(c: Classified, fmt: Formatters): Candidate | null {
  const internal = c.txns.filter((t) => t.kind === 'internal')
  const saved = internal.filter((t) => t.direction === 'out')
  const pulled = internal.filter((t) => t.direction === 'in')
  if (saved.length < 5 || pulled.length < 5) return null
  const back = pulled.reduce((s, t) => s + t.amount, 0)
  const ratio = pulled.length / saved.length
  return {
    id: 'vault',
    score: clamp(ratio * 0.8),
    evidence: `${saved.length} moves into savings, ${pulled.length} back out (${fmt.full(back)})`,
    tip: 'Try a locked or fixed savings target — friction is the whole point of a vault.',
    lines: {
      mild: [
        `You moved money into savings ${saved.length} times and back out ${pulled.length}. The thought counts.`,
      ],
      medium: [
        `Into savings ${saved.length} times, back out ${pulled.length}. The vault is a revolving door.`,
        `Your savings account has seen more withdrawals than a nervous ATM.`,
      ],
      spicy: [
        `${saved.length} deposits, ${pulled.length} withdrawals. Your savings plan is a catch-and-release programme.`,
        `You don't save money, you just give it a short holiday.`,
      ],
    },
  }
}

/**
 * How fast the biggest pay-in drains back to where the balance was before it.
 * Only uses one account's reported balances — they can't be mixed.
 */
function paydayVanish(c: Classified, fmt: Formatters): Candidate | null {
  const inflows = c.txns.filter(
    (t) => t.kind === 'external' && t.direction === 'in' && typeof t.balance === 'number',
  )
  if (!inflows.length) return null
  const pay = inflows.reduce((a, b) => (b.amount > a.amount ? b : a))
  const before = pay.balance! - pay.amount

  const account = c.txns
    .filter((t) => t.sourceId === pay.sourceId && typeof t.balance === 'number')
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || a.i - b.i)
    .map(({ t }) => t)
  const at = account.indexOf(pay)
  const gone = account.slice(at + 1).find((t) => t.balance! <= before + pay.amount * 0.05)
  if (!gone) return null

  const d = days(pay.date, gone.date)
  if (d > 45) return null
  const f = fmt.full(pay.amount)
  const when = d === 0 ? 'the same day' : d === 1 ? 'the next day' : `${d} days later`
  const lasted = d <= 1 ? 'barely a day' : `${d} days`
  return {
    id: 'payday',
    score: clamp(1 - d / 45),
    evidence: `${f} arrived ${pay.date}; balance back to ${fmt.full(before)} by ${gone.date}`,
    tip: 'Move a fixed slice of every big pay-in to savings the day it lands, before the spending starts.',
    sensitive: true,
    lines: {
      mild: [`Your biggest pay-in, ${f}, was spent back down ${when}. It was fun while it lasted.`],
      medium: [
        `${f} landed on ${pay.date}. By ${gone.date} it had left no forwarding address.`,
        `Your biggest deposit lasted ${lasted}. Mayflies have longer careers.`,
      ],
      spicy: [
        `${f} came in and was back out ${when}. Money doesn't stay with you, it just changes planes.`,
        `Your account treats a big deposit the way a toddler treats a new toy — gone in ${lasted}.`,
      ],
    },
  }
}

function weekdaySplurge(agg: Aggregates, fmt: Formatters): Candidate | null {
  const { first, last } = agg.coverage
  const span = days(first, last)
  if (span < 28) return null

  const occurrences = Array(7).fill(0)
  for (let i = 0; i <= span; i++) occurrences[new Date(Date.parse(first + 'T00:00:00Z') + i * DAY).getUTCDay()]++
  const totals = Array(7).fill(0)
  for (const cell of agg.daily.values()) totals[new Date(cell.date + 'T00:00:00Z').getUTCDay()] += cell.amount

  const avg = totals.map((t, i) => (occurrences[i] ? t / occurrences[i] : 0))
  const hi = avg.indexOf(Math.max(...avg))
  const positive = avg.filter((a) => a > 0)
  if (positive.length < 5) return null
  const lo = avg.indexOf(Math.min(...positive))
  const ratio = avg[hi] / avg[lo]
  if (ratio < 1.8) return null

  const [H, L] = [WEEKDAYS[hi], WEEKDAYS[lo]]
  const x = ratio.toFixed(1)
  return {
    id: 'weekday',
    score: clamp((ratio - 1.5) / 3),
    evidence: `${H}s average ${fmt.full(avg[hi])}, ${L}s ${fmt.full(avg[lo])}`,
    tip: `Plan ${H}s ahead — decide the budget before the day starts, not during it.`,
    lines: {
      mild: [`${H} you spends ${x}× what ${L} you does. ${L} you is the responsible sibling.`],
      medium: [
        `${H} you spends ${x}× more than ${L} you. ${L} you is tired of covering for them.`,
        `Your wallet has a favourite day, and it's ${H}. ${x}× the damage of a ${L}.`,
      ],
      spicy: [
        `${H} you spends ${x}× what ${L} you does. ${L} you has filed a formal complaint.`,
        `Every ${H}, your budget goes on a ${x}× bender and ${L} cleans up the mess.`,
      ],
    },
  }
}

function overdraftOptimist(agg: Aggregates, fmt: Formatters): Candidate | null {
  const { inflow, spend } = agg.totals
  if (inflow <= 0 || spend <= inflow) return null
  const ratio = spend / inflow
  return {
    id: 'overdraft',
    score: clamp((ratio - 1) * 3),
    evidence: `${fmt.full(spend)} out against ${fmt.full(inflow)} in`,
    tip: 'Pick the one category that grew most and trim it first — small cuts in the biggest line beat big cuts in small ones.',
    sensitive: true,
    lines: {
      mild: [`You spent ${pct(ratio)} of what came in. Optimism is a lovely trait.`],
      medium: [
        `You spent ${pct(ratio)} of what came in. Bold macroeconomic policy.`,
        `Out: ${pct(ratio)} of in. Your budget runs on vibes and faith.`,
      ],
      spicy: [
        `You spent ${pct(ratio)} of your income. Governments get downgraded for less.`,
        `${pct(ratio)} of income, spent. Even your overdraft is asking questions.`,
      ],
    },
  }
}

// ---------------------------------------------------------------------------

/**
 * Signs the person may be struggling — jokes about money running out stop
 * being funny then. Heavy loan repayments, or a balance that usually sits near
 * empty while more goes out than comes in.
 *
 * A low balance alone isn't enough: plenty of people keep their main account
 * near zero and sweep everything into vaults or other banks, and the balance
 * chart only follows one account.
 */
function strained(agg: Aggregates): boolean {
  const loan = agg.categories.find((c) => c.category === 'loan')?.amount ?? 0
  if (agg.totals.spend > 0 && loan / agg.totals.spend > 0.2) return true
  if (agg.totals.net < 0 && agg.balance.length >= 10 && agg.monthly.length) {
    const monthly = agg.monthly.reduce((s, m) => s + m.amount, 0) / agg.monthly.length
    if (median(agg.balance.map((b) => b.balance)) < monthly * 0.05) return true
  }
  return false
}

function compliment(agg: Aggregates, fmt: Formatters): string {
  if (agg.totals.net > 0 && agg.totals.inflow > 0)
    return `To be fair, you kept ${fmt.full(agg.totals.net)} — ${pct(agg.totals.net / agg.totals.inflow)} of everything that came in. Plenty of people can't say that.`

  const { first, last } = agg.coverage
  let best = 0
  let run = 0
  const span = days(first, last)
  for (let i = 0; i <= span; i++) {
    const d = new Date(Date.parse(first + 'T00:00:00Z') + i * DAY).toISOString().slice(0, 10)
    run = agg.daily.has(d) ? 0 : run + 1
    best = Math.max(best, run)
  }
  if (best >= 3) return `In fairness, you once went ${best} days in a row without spending a thing. Legend.`

  const calm = [...agg.monthly].sort((a, b) => a.amount - b.amount)[0]
  if (calm && agg.monthly.length > 1)
    return `Your calmest month was ${calm.key}, at ${fmt.full(calm.amount)}. So it can be done.`

  return 'You opened your own bank statements on purpose. That takes more courage than most people have.'
}

export function roast(
  c: Classified,
  agg: Aggregates,
  fmt: Formatters,
  {
    heat = 'medium',
    seed = 0,
    limit = 5,
    unlocked = false,
  }: {
    heat?: Heat
    seed?: number
    limit?: number
    /** The user said "I can take it" — skip the strain guardrail. */
    unlocked?: boolean
  } = {},
): RoastSet {
  const spend = c.txns.filter((t) => t.kind === 'external' && t.direction === 'out')
  const softened = !unlocked && strained(agg)
  const level: Heat = softened ? 'mild' : heat

  const found = [
    feeBleed(c, fmt),
    airtimeDrip(spend, fmt),
    loyalCustomer(agg, fmt),
    revolvingVault(c, fmt),
    paydayVanish(c, fmt),
    weekdaySplurge(agg, fmt),
    overdraftOptimist(agg, fmt),
  ].filter((x): x is Candidate => !!x && !(softened && x.sensitive))

  const roasts = found
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => {
      const options = x.lines[level]
      return {
        id: x.id,
        heat: level,
        score: x.score,
        line: options[(seed + hash(x.id)) % options.length],
        evidence: x.evidence,
        tip: x.tip,
      }
    })

  return { roasts, compliment: compliment(agg, fmt), tip: roasts[0]?.tip, softened }
}
