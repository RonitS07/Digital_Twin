import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/twin-chat': {
        target: 'http://localhost:8000',
        ws: true
      },
      '/agent/ws': {
        target: 'http://localhost:8000',
        ws: true
      },
      '/auth': 'http://localhost:8000',
      '/ai': 'http://localhost:8000',
      '/gmail': 'http://localhost:8000',
      '/calendar': 'http://localhost:8000',
      '/sessions': 'http://localhost:8000',
      '/history': 'http://localhost:8000',
      '/analytics': 'http://localhost:8000',
      '/activity': 'http://localhost:8000',
      '/agent': 'http://localhost:8000',
      '/mcp': 'http://localhost:8000',
      '/intelligence': 'http://localhost:8000',
      '/test-telegram': 'http://localhost:8000',
      '/settings': 'http://localhost:8000',
      '/integrations': 'http://localhost:8000',
      '/oauth': 'http://localhost:8000',
      '/memory': 'http://localhost:8000',
      '/admin': 'http://localhost:8000'
    }
  },
})
