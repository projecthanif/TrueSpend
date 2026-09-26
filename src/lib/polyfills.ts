/*
 * pdf.js's legacy build polyfills almost everything it uses, but not
 * `Promise.withResolvers` — missing before iOS 17.4 and Chrome 119. Import this
 * before pdf.js wherever it runs.
 */
const P = Promise as unknown as { withResolvers?: () => unknown }
P.withResolvers ??= () => {
  let resolve!: (v: unknown) => void
  let reject!: (e: unknown) => void
  const promise = new Promise((a, b) => ((resolve = a), (reject = b)))
  return { promise, resolve, reject }
}

/*
 * Nor async iteration over a `ReadableStream` — `getTextContent` reads its
 * stream with `for await`, which Safari only supports from 26. Without it every
 * PDF fails on iOS with "undefined is not a function".
 */
const RS = globalThis.ReadableStream?.prototype as unknown as
  | { values?: unknown; [Symbol.asyncIterator]?: unknown }
  | undefined
if (RS && !RS[Symbol.asyncIterator]) {
  RS.values = async function* <T>(this: ReadableStream<T>, { preventCancel = false } = {}) {
    const reader = this.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      if (!preventCancel) await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  RS[Symbol.asyncIterator] = RS.values
}
