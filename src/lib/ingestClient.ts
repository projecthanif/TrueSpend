import { ingest, type Ingested, type OnProgress } from './ingest'
import type { FromWorker, ToWorker } from './ingest.worker'

export interface UploadProgress {
  /** 1-based index of the file being read. */
  file: number
  files: number
  name: string
  page?: number
  pages?: number
}

let worker: Worker | null | undefined

/** One worker for the session; `null` once we know workers can't be used. */
function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./ingest.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null
  }
  return worker
}

let jobs = 0

function inWorker(w: Worker, file: File, onProgress: OnProgress): Promise<Ingested> {
  const job = ++jobs
  return new Promise((resolve, reject) => {
    const onMessage = ({ data }: MessageEvent<FromWorker>) => {
      if (data.job !== job) return
      if (data.type === 'progress') return onProgress(data)
      cleanup()
      resolve(data.result)
    }
    const onError = (e: ErrorEvent | MessageEvent) => {
      cleanup()
      reject(e)
    }
    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      w.removeEventListener('messageerror', onError)
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.addEventListener('messageerror', onError)
    w.postMessage({ job, file } satisfies ToWorker)
  })
}

/**
 * Parse files one after another, reporting where it's up to.
 *
 * The worker is an optimisation, never a requirement: if it can't start or
 * dies mid-file, that file is parsed on the main thread instead and the rest
 * follow it there. Slower, but an upload never fails because of the worker.
 */
export async function ingestFiles(
  files: File[],
  onProgress: (p: UploadProgress) => void,
): Promise<Ingested[]> {
  const results: Ingested[] = []
  for (const [i, file] of files.entries()) {
    const base = { file: i + 1, files: files.length, name: file.name }
    onProgress(base)
    const report: OnProgress = (p) => onProgress({ ...base, ...p })

    const w = getWorker()
    let result: Ingested | undefined
    if (w) {
      try {
        result = await inWorker(w, file, report)
      } catch {
        w.terminate()
        worker = null
      }
    }
    results.push(result ?? (await ingest(file, report)))
  }
  return results
}
