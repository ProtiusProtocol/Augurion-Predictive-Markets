import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      // Prevent SDK (Node.js-only) from being bundled in browser
      '@protius/sdk': false,
    }
  },
  define: {
    global: 'globalThis'
  }
})
