import { useEffect, useRef, useState, type ReactNode } from 'react'
import { downloadCsv, downloadPng, slug, type CsvData } from '../lib/export'

/**
 * Download control for a card.
 *
 * `csv` is a thunk so the rows are only built when the user actually asks —
 * the daily heatmap has thousands of them and rebuilding on every render would
 * be wasted work.
 */
function DownloadMenu({
  target,
  name,
  csv,
}: {
  target: React.RefObject<HTMLElement | null>
  name: string
  csv?: () => CsvData
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const png = async () => {
    setOpen(false)
    setBusy(true)
    setError(false)
    try {
      if (target.current) await downloadPng(target.current, slug(name))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const item =
    'block w-full cursor-pointer px-4 py-2.5 text-left text-[13px] text-body transition hover:bg-p0 hover:text-p5'

  return (
    <div ref={wrap} className="relative shrink-0" data-export-ignore>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label={`Download ${name}`}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted transition hover:border-p3 hover:text-p5 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15V3m0 12-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>
        {busy ? 'Saving…' : error ? 'Failed' : 'Save'}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-40 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-[0_6px_20px_rgba(0,0,0,0.09)]">
          <button type="button" className={item} onClick={png}>
            PNG image
          </button>
          {csv && (
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false)
                downloadCsv(csv(), slug(name))
              }}
            >
              CSV data
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function Card({
  title,
  subtitle,
  children,
  footer,
  csv,
  downloadName,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** Underlying numbers for the CSV option. Omit to offer PNG only. */
  csv?: () => CsvData
  /** Defaults to the title; set when the file should be named differently. */
  downloadName?: string
}) {
  const card = useRef<HTMLElement>(null)

  return (
    <section
      ref={card}
      className="rise rounded-3xl border border-line bg-card px-7 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-body">{title}</h2>
          {subtitle && <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p>}
        </div>
        <DownloadMenu target={card} name={downloadName ?? title} csv={csv} />
      </div>
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
      data-export-ignore
      className="pointer-events-none fixed z-50 whitespace-nowrap rounded-lg bg-[#1b1a18] px-3 py-2 text-[12.5px] leading-relaxed text-white"
      style={{ left: Math.min(x + 14, window.innerWidth - 240), top: y - 70 }}
    >
      {children}
    </div>
  )
}
