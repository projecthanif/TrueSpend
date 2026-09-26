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
