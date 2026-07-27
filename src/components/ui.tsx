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
    'block w-full cursor-pointer px-4 py-2.5 text-left text-[12px] text-body transition-colors hover:bg-p0 hover:text-ink'

  return (
    <div ref={wrap} className="relative shrink-0" data-export-ignore>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label={`Download ${name}`}
        className="flex cursor-pointer items-center gap-1.5 border-b border-transparent px-0 py-1 text-[11px] font-medium text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15V3m0 12-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>
        {busy ? 'Saving…' : error ? 'Failed' : 'Save'}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden border border-line bg-card py-1 shadow-[0_12px_30px_rgba(15,20,16,0.1)]">
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
      className="rise border-t border-line pt-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-medium tracking-[-0.035em] text-ink">{title}</h2>
          {subtitle && <p className="mt-2 max-w-2xl text-[13px] leading-5 text-muted">{subtitle}</p>}
        </div>
        <DownloadMenu target={card} name={downloadName ?? title} csv={csv} />
      </div>
      <div className="mt-10">{children}</div>
      {footer && <div className="mt-8 border-t border-line pt-5 text-[12px] text-body">{footer}</div>}
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
    <div className="inline-flex border-b border-line">
      {items.map((it) => (
        <button
          key={String(it)}
          type="button"
          onClick={() => onChange(it)}
          className={
            'cursor-pointer border-b-2 px-4 py-2 text-[14px] transition-colors ' +
            (it === value
              ? 'border-ink font-semibold text-ink'
              : 'border-transparent font-medium text-muted hover:text-body')
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
        <i key={c} className={`inline-block size-3 ${c}`} />
      ))}
      {to}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-line px-0 py-6 last:border-b-0 sm:px-6 lg:border-r lg:border-b-0 lg:first:pl-0 lg:last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted">{label}</div>
      <div className="mt-3 text-[clamp(1.6rem,3vw,2.15rem)] font-medium tracking-[-0.04em] text-ink">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
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
