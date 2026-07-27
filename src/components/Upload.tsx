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
          className="cursor-pointer rounded-xl border border-line bg-card px-4 py-2 text-[13.5px] font-medium text-body transition hover:border-p3 hover:text-p5"
        >
          {busy ? 'Reading…' : 'Add statement'}
        </button>
        {picker}
      </>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
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
          'cursor-pointer rounded-3xl border-2 border-dashed px-8 py-16 text-center transition ' +
          (over ? 'border-p4 bg-p0' : 'border-line bg-card hover:border-p2')
        }
      >
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-p1">
          <svg viewBox="0 0 24 24" className="size-7 stroke-p5" fill="none" strokeWidth="1.8">
            <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-[19px] font-semibold text-ink">
          {busy ? 'Reading your statements…' : 'Drop your statements here'}
        </p>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-body">
          Any bank, any format — <b>PDF</b>, <b>XLSX</b> or <b>CSV</b>. Add several to see one
          combined picture. Everything is read in your browser; no file ever leaves this machine.
        </p>
      </div>
      {picker}
    </div>
  )
}
