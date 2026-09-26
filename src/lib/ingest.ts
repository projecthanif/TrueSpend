import type { ColumnMap, RawTable, Statement } from './types'
import { CONFIDENCE_FLOOR, detectColumns } from './detectColumns'
import { buildStatement } from './buildStatement'

/** A file that parsed cleanly, or one that needs the user to confirm columns. */
export type Ingested =
  | { status: 'ready'; statement: Statement }
  | { status: 'review'; id: string; fileName: string; table: RawTable; map: ColumnMap; reason: string }
  | { status: 'failed'; fileName: string; error: string }

/** Progress within one file. Only PDFs report it — they're the slow ones. */
export type OnProgress = (p: { page: number; pages: number }) => void

/*
 * Parsing runs in a worker with its own module scope, so a per-module counter
 * would hand out ids the main thread has already used.
 */
let counter = 0
const nextId = () => globalThis.crypto?.randomUUID?.() ?? `src-${Date.now().toString(36)}-${++counter}`

async function extract(file: File, onProgress?: OnProgress): Promise<RawTable> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  /*
   * Loaded on demand: pdf.js and SheetJS are most of the app's weight, and
   * normally only the parsing worker ever needs them.
   */
  if (ext === 'pdf') {
    const { extractPdf } = await import('./extractPdf')
    return extractPdf(file, (page, pages) => onProgress?.({ page, pages }))
  }
  if (['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'txt'].includes(ext)) {
    const { extractTable } = await import('./extractTable')
    return extractTable(file)
  }
  throw new Error(`Unsupported file type “.${ext}”. Upload a PDF, XLSX or CSV statement.`)
}

/**
 * One file in, one outcome out. Detection is always attempted; the review path
 * is a fallback, not a failure — it's what makes an unfamiliar bank workable
 * rather than a dead end.
 */
export async function ingest(file: File, onProgress?: OnProgress): Promise<Ingested> {
  const id = nextId()
  try {
    const table = await extract(file, onProgress)
    const map = detectColumns(table)

    if (map.confidence < CONFIDENCE_FLOOR) {
      return {
        status: 'review',
        id,
        fileName: file.name,
        table,
        map,
        reason:
          map.notes[0] ??
          "The columns in this statement aren't recognisable — please confirm what each one is.",
      }
    }

    return { status: 'ready', statement: buildStatement(id, file.name, table, map) }
  } catch (e) {
    return { status: 'failed', fileName: file.name, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Re-run the build after the user has corrected the mapping by hand. */
export function applyMapping(
  id: string,
  fileName: string,
  table: RawTable,
  map: ColumnMap,
): Ingested {
  try {
    return { status: 'ready', statement: buildStatement(id, fileName, table, map) }
  } catch (e) {
    return { status: 'failed', fileName, error: e instanceof Error ? e.message : String(e) }
  }
}
