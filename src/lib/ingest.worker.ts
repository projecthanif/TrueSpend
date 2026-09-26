/// <reference lib="webworker" />
import { ingest, type Ingested } from './ingest'

/**
 * Runs the whole parse off the main thread. A long PDF or a big workbook used to
 * freeze the page for as long as it took; here it only occupies this worker.
 *
 * pdf.js starts its own worker from inside this one, which every current
 * browser supports.
 */

export type ToWorker = { job: number; file: File }
export type FromWorker =
  | { job: number; type: 'progress'; page: number; pages: number }
  | { job: number; type: 'done'; result: Ingested }

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  const post = (m: FromWorker) => self.postMessage(m)
  const result = await ingest(data.file, (p) => post({ job: data.job, type: 'progress', ...p }))
  post({ job: data.job, type: 'done', result })
}
