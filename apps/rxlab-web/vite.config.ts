import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  // Relative asset URLs: the rxlab-app bundle may mount the dist under any
  // directory, so every asset resolves from the served index's own base.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': src('./src') },
  },
  server: {
    port: 5174,
    // Dev convenience: forward harness API traffic to a locally running
    // `dsh rxlab` (defaults to its 3081 port; override with DSH_RXLAB_URL).
    // changeOrigin stays false so the browser's SameSite=Strict cookie keeps
    // matching the authority it was minted for through the proxy.
    proxy: {
      '/api': {
        target: process.env.DSH_RXLAB_URL ?? 'http://127.0.0.1:3081',
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: true,
  },
})
