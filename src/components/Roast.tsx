import { useMemo, useState } from 'react'
import type { Aggregates } from '../lib/aggregate'
import type { Classified } from '../lib/classify'
import { useFormat } from '../lib/format'
import { HEATS, roast, type Heat } from '../lib/roast'
import { Card, Tabs } from './ui'

const HEAT_LABEL: Record<Heat, string> = { mild: 'Mild', medium: 'Medium', spicy: 'Spicy' }
const LABEL_HEAT = Object.fromEntries(HEATS.map((h) => [HEAT_LABEL[h], h])) as Record<string, Heat>

export function Roast({ classified, data }: { classified: Classified; data: Aggregates }) {
  const fmt = useFormat()
  const [heat, setHeat] = useState<Heat>('medium')
  const [seed, setSeed] = useState(0)
  // Opt-in: nobody gets roasted without asking.
  const [started, setStarted] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  const set = useMemo(
    () => (started ? roast(classified, data, fmt, { heat, seed, unlocked }) : null),
    [started, classified, data, fmt, heat, seed, unlocked],
  )

  const button =
    'cursor-pointer border border-ink px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-ink hover:text-white'

  return (
    <Card
      title="Roast me"
      subtitle="An affectionate once-over of your habits, drawn from the numbers above. Written on your device like everything else."
      footer={
        set && (
          <div className="grid gap-4 md:grid-cols-2">
            <p>
              <b className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.17em] text-g3">
                In your defence
              </b>
              {set.compliment}
            </p>
            {set.tip && (
              <p>
                <b className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.17em] text-muted">
                  One thing to try
                </b>
                {set.tip}
              </p>
            )}
          </div>
        )
      }
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4" data-export-ignore>
        <Tabs
          items={HEATS.map((h) => HEAT_LABEL[h])}
          value={HEAT_LABEL[heat]}
          onChange={(l) => setHeat(LABEL_HEAT[l])}
        />
        <button
          type="button"
          className={button}
          onClick={() => (started ? setSeed((s) => s + 1) : setStarted(true))}
        >
          {started ? 'Roast me again' : 'Roast me 🔥'}
        </button>
      </div>

      {set?.softened && heat !== 'mild' && (
        <p className="mb-6 text-[12.5px] text-muted">
          Keeping it mild: the statements suggest things have been tight, and that's not a joke.{' '}
          <button
            type="button"
            onClick={() => setUnlocked(true)}
            className="cursor-pointer font-medium text-ink underline underline-offset-2 hover:text-g3"
          >
            I can take it
          </button>
        </p>
      )}

      {set && !set.roasts.length && (
        <p className="text-[15px] text-body">
          Honestly? Nothing here to roast. Suspiciously well-behaved.
        </p>
      )}

      {set && set.roasts.length > 0 && (
        <ol className="grid gap-px overflow-hidden border border-line bg-line md:grid-cols-2">
          {set.roasts.map((r, i) => (
            <li key={r.id} className="rise bg-card p-6" style={{ animationDelay: `${i * 60}ms` }}>
              <p className="text-[18px] font-medium leading-snug tracking-[-0.02em] text-ink">
                {r.line}
              </p>
              <p className="mt-3 text-[12px] text-muted">{r.evidence}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
