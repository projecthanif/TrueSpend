import type { Identity, Kind, Category, Overrides, Patch } from './types'

/**
 * Opt-in memory for the things a user has to type or fix by hand: their name
 * variants, account numbers and classification corrections.
 *
 * Statements are never stored. Per-row corrections are keyed by a hash of the
 * row (see `txnKey`), so what lands in storage carries no amounts, dates or
 * narrations — only names the user entered and opaque keys.
 */

const KEY = 'truespend:v1'

export interface Saved {
  identity: Identity
  overrides: Overrides
}

const KINDS = new Set<Kind>(['external', 'self', 'internal', 'fee', 'reversal'])
const CATEGORIES = new Set<Category>(['transfer', 'card', 'airtime', 'data', 'bills', 'loan', 'cash', 'other'])

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [])

/** Storage is user-editable and survives app versions, so trust nothing in it. */
function patches(v: unknown): Record<string, Patch> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, Patch> = {}
  for (const [k, p] of Object.entries(v as Record<string, Record<string, unknown>>)) {
    if (!p || typeof p !== 'object') continue
    const patch: Patch = {}
    if (KINDS.has(p.kind as Kind)) patch.kind = p.kind as Kind
    if (CATEGORIES.has(p.category as Category)) patch.category = p.category as Category
    if (patch.kind || patch.category) out[k] = patch
  }
  return out
}

/** `null` means the user hasn't opted in (or storage is unavailable). */
export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return {
      identity: {
        names: strings(data?.identity?.names),
        accountNumbers: strings(data?.identity?.accountNumbers),
      },
      overrides: {
        byTxn: patches(data?.overrides?.byTxn),
        byCounterparty: patches(data?.overrides?.byCounterparty),
      },
    }
  } catch {
    return null
  }
}

export function save(data: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Private mode or quota — remembering is a convenience, never a failure.
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * cyrb53 — a small, fast 53-bit string hash. Not cryptographic; it only has to
 * make row keys stable across sessions without writing the row itself to disk.
 */
function hash(s: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * A row's identity, independent of upload order or session. The same entry in
 * a re-uploaded or overlapping statement gets the same key, so a correction
 * made once sticks. `occurrence` separates genuinely identical rows in a file.
 */
export function txnKey(
  account: string,
  t: { date: string; direction: string; amount: number; description: string },
  occurrence: number,
) {
  return hash([account, t.date, t.direction, t.amount.toFixed(2), t.description, occurrence].join('|'))
}
