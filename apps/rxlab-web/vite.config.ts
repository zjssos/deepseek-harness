import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { clientBuildEnvironmentDefines } from '../../scripts/client-build-environment.ts'

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  // Relative asset URLs: the rxlab-app bundle may mount the dist under any
  // directory, so every asset resolves from the served index's own base.
  base: './',
  define: {
    ...clientBuildEnvironmentDefines(process.env),
    // vendored loader internal.ts: fromInternal() probes the Node major —
    // "0.0.0" takes neither branch, returning undefined (exactly the empty
    // internal slot the shell boot fills with the client module loader).
    'process.versions.node': '"0.0.0"',
    'process.execArgv': '[]',
    // vendored loader index.ts: envData falls to its default branch.
    'process.env.CORDIS_SHARED': 'undefined',
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: src('./src') },
      // Browserize the vendored Cordis Loader's only Node import.
      { find: /^node:module$/, replacement: src('./src/node-module-stub.ts') },
    ],
  },
  server: {
    port: 5174,
    // Dev convenience: forward harness API and client-module traffic to a
    // locally running `dsh rxlab` (defaults to its 3081 port; override with
    // DSH_RXLAB_URL). changeOrigin stays false so the browser's SameSite=Strict
    // cookie keeps matching the authority it was minted for through the proxy.
    proxy: {
      '/api': {
        target: process.env.DSH_RXLAB_URL ?? 'http://127.0.0.1:3081',
        changeOrigin: false,
        // The session data layer multiplexes Remote streams (session/follow,
        // session/control, $events) over a WebSocket on /api/remote.mux.
        ws: true,
      },
      '/plugins': {
        target: process.env.DSH_RXLAB_URL ?? 'http://127.0.0.1:3081',
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: true,
  },
})
