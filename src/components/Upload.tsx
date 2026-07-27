import { useCallback, useRef, useState } from 'react'
import { ingest, type Ingested } from '../lib/ingest'

interface Props {
  onIngested: (results: Ingested[]) => void
  compactMode?: boolean
}

const ACCEPT = '.pdf,.xlsx,.xls,.xlsm,.csv,.tsv'

export function Upload({ onIngested, compactMode }: Props) {
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const handle = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      setBusy(true)
      const results: Ingested[] = []
      for (const file of Array.from(files)) results.push(await ingest(file))
      setBusy(false)
      if (input.current) input.current.value = '' // allow re-selecting the same file
      onIngested(results)
    },
    [onIngested],
  )

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => void handle(e.target.files)}
    />
  )

  if (compactMode) {
    return (
      <>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="cursor-pointer border border-ink bg-ink px-4 py-2.5 text-[12px] font-medium text-card transition-colors hover:bg-p5"
        >
          {busy ? 'Reading…' : 'Add files'}
        </button>
        {picker}
      </>
    )
  }

  return (
    <div className="w-full">
      <button
        type="button"
        aria-label="Choose bank statement files"
        disabled={busy}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void handle(e.dataTransfer.files)
        }}
        onClick={() => input.current?.click()}
        className={
          'group flex min-h-[390px] w-full cursor-pointer flex-col justify-between border p-7 text-left transition-colors sm:p-10 ' +
          (over
            ? 'border-g2 bg-p5 text-card'
            : 'border-ink bg-ink text-card hover:border-p5 hover:bg-p5')
        }
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-card/55">
            01 / Add statements
          </span>
          <span className="grid size-11 place-items-center rounded-full border border-card/25 transition-transform group-hover:-translate-y-1">
            <svg viewBox="0 0 24 24" className="size-5 stroke-card" fill="none" strokeWidth="1.6">
              <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        <div>
          <p className="max-w-md text-[clamp(2rem,4vw,3.2rem)] font-medium leading-[1.02] tracking-[-0.045em]">
            {busy ? 'Reading your statements…' : 'Drop files here or choose from your device.'}
          </p>
          <p className="mt-5 max-w-md text-[13px] leading-6 text-card/60">
            PDF, XLSX, XLS or CSV. Add several accounts for one combined view.
          </p>
          <div className="mt-8 flex items-center gap-2 border-t border-card/15 pt-5 text-[11px] uppercase tracking-[0.14em] text-card/50">
            <svg viewBox="0 0 24 24" className="size-3.5 stroke-g1" fill="none" strokeWidth="1.8">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
            Files stay in this browser
          </div>
        </div>
      </button>
      {picker}
    </div>
  )
}
