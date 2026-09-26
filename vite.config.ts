import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  /*
   * pdf.js is only imported from a lazily loaded module inside the worker, so
   * the startup scan misses it. Discovered on the first upload, it triggers a
   * re-optimisation mid-request and the import fails with a 504.
   */
  optimizeDeps: {
    include: ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
})
