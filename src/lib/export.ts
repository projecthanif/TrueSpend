/** A chart's underlying numbers: a header row followed by data rows. */
export type CsvData = (string | number)[][]

/**
 * RFC 4180 escaping. Not optional here — counterparty names come straight from
 * bank narrations and routinely contain commas ("HAIGHA & CO, LTD"), quotes and
 * the occasional stray newline. Unescaped, one of those shifts every following
 * column and quietly corrupts the file.
 */
function escapeCell(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: CsvData): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Filesystem-safe, lowercase, no spaces. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function downloadCsv(rows: CsvData, name: string) {
  // The BOM makes Excel open UTF-8 correctly instead of mangling ₦ and accents.
  triggerDownload(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`)
}

export async function downloadPng(element: HTMLElement, name: string) {
  /*
   * The card is transparent over the page background, so a capture without an
   * explicit colour comes out see-through — black once pasted into most apps.
   * `--color-card` is read from the live element so the export tracks the theme.
   */
  const background =
    getComputedStyle(element).getPropertyValue('--color-card').trim() || '#fbfaf7'

  // Only needed when someone actually saves a picture, so it loads on demand.
  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(element, {
    backgroundColor: background,
    pixelRatio: 2, // legible when scaled down in a doc or slide
    cacheBust: true,
    // Controls and the cursor tooltip belong to the app, not the picture.
    filter: (node) =>
      !(node instanceof HTMLElement && node.dataset.exportIgnore !== undefined),
  })

  const blob = await (await fetch(dataUrl)).blob()
  triggerDownload(blob, `${name}.png`)
}
