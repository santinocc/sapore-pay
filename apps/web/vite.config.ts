import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  optimizeDeps: {
    // idkit-core loads its WASM via `new URL('idkit_wasm_bg.wasm',
    // import.meta.url)`. Pre-bundling moves the JS into .vite/deps/ without
    // the .wasm, so the dev server answered that URL with index.html
    // ("expected magic word 00 61 73 6d, found 3c 21 64 6f"). Served from
    // its real node_modules location, the URL resolves. `vite build` is
    // unaffected — it emits the .wasm as an asset either way.
    exclude: ['@worldcoin/idkit-core'],
  },
})
