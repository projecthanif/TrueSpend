import type { ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="rise rounded-3xl border border-line bg-card px-7 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-body">{title}</h2>
      {subtitle && <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 border-t border-line pt-4 text-[13px] text-body">{footer}</div>}
    </section>
  )
}

export function Tabs<T extends string | number>({
  items,
  value,
  onChange,
}: {
  items: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex gap-1 rounded-2xl border border-line bg-card p-2">
      {items.map((it) => (
        <button
          key={String(it)}
          type="button"
          onClick={() => onChange(it)}
          className={
            'cursor-pointer rounded-xl px-5 py-2.5 text-[17px] transition ' +
            (it === value
              ? 'bg-p5 font-semibold text-white shadow-[0_1px_3px_rgba(91,46,168,0.35)]'
              : 'font-medium text-[#a5a29a] hover:text-body')
          }
        >
          {it}
        </button>
      ))}
    </div>
  )
}

export function Legend({ ramp, from = 'Less', to = 'More' }: { ramp: string[]; from?: string; to?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
      {from}
      {ramp.map((c) => (
        <i key={c} className={`inline-block size-4 rounded-[5px] ${c}`} />
      ))}
      {to}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-5 py-4">
      <div className="text-[12px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1.5 text-[26px] font-bold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[12.5px] text-muted">{hint}</div>}
    </div>
  )
}

/** Cursor-following tooltip — one instance, driven by hovered cell data. */
export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed z-50 whitespace-nowrap rounded-lg bg-[#1b1a18] px-3 py-2 text-[12.5px] leading-relaxed text-white"
      style={{ left: Math.min(x + 14, window.innerWidth - 240), top: y - 70 }}
    >
      {children}
    </div>
  )
}
