import { useState } from 'react'
import type { Identity } from '../lib/types'
import { CURRENCY_CHOICES } from '../lib/money'

interface Props {
  identity: Identity
  /** Every loaded file, across all currencies. */
  statements: { id: string; fileName: string; currency: string }[]
  onChange: (identity: Identity) => void
  onStatementCurrency: (id: string, currency: string) => void
  selfTotal: string
  remember: boolean
  onRememberChange: (remember: boolean) => void
}

function Chips({
  items,
  onRemove,
  onAdd,
  placeholder,
  label,
  hint,
}: {
  items: string[]
  onRemove: (v: string) => void
  onAdd: (v: string) => void
  placeholder: string
  label: string
  hint: string
}) {
  const [draft, setDraft] = useState('')
  const submit = () => {
    const v = draft.trim()
    if (v && !items.includes(v)) onAdd(v)
    setDraft('')
  }

  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{hint}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {items.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 border border-line bg-card py-1.5 pl-3 pr-2 text-[12px] text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(v)}
              aria-label={`Remove ${v}`}
              className="cursor-pointer px-1 text-[15px] leading-none text-muted transition-colors hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          onBlur={submit}
          placeholder={placeholder}
          className="min-w-[190px] flex-1 border-0 border-b border-line bg-transparent px-1 py-1.5 text-[12px] outline-none transition-colors placeholder:text-muted focus:border-ink"
        />
      </div>
    </div>
  )
}

/**
 * Self-transfer detection is the difference between a useful dashboard and a
 * wrong one, and it hinges on knowing who the user is. Detection gets it right
 * most of the time; this panel is how it gets corrected the rest of the time.
 */
export function IdentityPanel({
  identity,
  statements,
  onChange,
  onStatementCurrency,
  selfTotal,
  remember,
  onRememberChange,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <section className="border-y border-line py-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
      >
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-body">
            This is me
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">
            {identity.names.length
              ? `${identity.names.join(', ')} · ${selfTotal} treated as your own transfers`
              : 'No name detected — add yours so self-transfers stop counting as income'}
          </p>
        </div>
        <span className="shrink-0 border-b border-line pb-0.5 text-[12px] font-medium text-ink">
          {open ? 'Done' : 'Edit'}
        </span>
      </button>

      {open && (
        <div className="mt-5 grid gap-7 border-t border-line pt-6 md:grid-cols-2">
          <Chips
            label="Your names"
            hint="Add every spelling your banks use. Money to or from these names counts as moving your own funds, not income or spending."
            items={identity.names}
            placeholder="Add a name…"
            onAdd={(v) => onChange({ ...identity, names: [...identity.names, v] })}
            onRemove={(v) => onChange({ ...identity, names: identity.names.filter((n) => n !== v) })}
          />
          <Chips
            label="Your account numbers"
            hint="Optional but conclusive — a description containing one of these is always a self-transfer, whatever the name says."
            items={identity.accountNumbers}
            placeholder="Add an account number…"
            onAdd={(v) =>
              onChange({ ...identity, accountNumbers: [...identity.accountNumbers, v] })
            }
            onRemove={(v) =>
              onChange({
                ...identity,
                accountNumbers: identity.accountNumbers.filter((n) => n !== v),
              })
            }
          />
<div>
            <div className="text-[12px] uppercase tracking-[0.12em] text-muted">
              Statement currency
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Read from each file. Correct it here if it's wrong. Different currencies are
              never added together.
            </p>
            <ul className="mt-2.5 space-y-2">
              {statements.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[12.5px] text-ink" title={s.fileName}>
                    {s.fileName}
                  </span>
                  <select
                    value={s.currency}
                    onChange={(e) => onStatementCurrency(s.id, e.target.value)}
                    aria-label={`Currency of ${s.fileName}`}
                    className="shrink-0 cursor-pointer border border-line bg-card px-2 py-1 text-[12px] text-ink"
                  >
                    {/* Keep a detected value selectable even if it isn't in the list. */}
                    {[...new Set([s.currency, ...CURRENCY_CHOICES])].sort().map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => onRememberChange(e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--color-g3)]"
              />
              <span>
                <span className="block text-[12px] uppercase tracking-[0.12em] text-muted">
                  Remember on this device
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
                  Keeps your names, account numbers and corrections in this browser for next
                  time. Statements are never stored. Turning this off deletes what was saved.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}
    </section>
  )
}
