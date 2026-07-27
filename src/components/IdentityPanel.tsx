import { useState } from 'react'
import type { Identity } from '../lib/types'
import { CURRENCY_CHOICES } from '../lib/money'

interface Props {
  identity: Identity
  currency: string
  onChange: (identity: Identity) => void
  onCurrencyChange: (currency: string) => void
  selfTotal: string
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-p0 py-1.5 pl-3 pr-2 text-[13px] text-p5"
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(v)}
              aria-label={`Remove ${v}`}
              className="cursor-pointer rounded px-1 text-[15px] leading-none text-p3 transition hover:text-p5"
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
          className="min-w-[190px] flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-[13px] outline-none transition placeholder:text-muted focus:border-p3"
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
export function IdentityPanel({ identity, currency, onChange, onCurrencyChange, selfTotal }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-3xl border border-line bg-card px-7 py-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
      >
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-body">
            This is me
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">
            {identity.names.length
              ? `${identity.names.join(', ')} · ${selfTotal} treated as your own transfers`
              : 'No name detected — add yours so self-transfers stop counting as income'}
          </p>
        </div>
        <span className="shrink-0 text-[13px] text-p5">{open ? 'Done' : 'Edit'}</span>
      </button>

      {open && (
        <div className="mt-6 grid gap-6 border-t border-line pt-6 md:grid-cols-2">
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
          <label className="text-[12px] uppercase tracking-[0.12em] text-muted">
            Currency
            <select
              value={currency}
              onChange={(e) => onCurrencyChange(e.target.value)}
              className="mt-2 block w-full cursor-pointer rounded-lg border border-line bg-paper px-3 py-2 text-[13.5px] normal-case tracking-normal text-ink"
            >
              {CURRENCY_CHOICES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  )
}
