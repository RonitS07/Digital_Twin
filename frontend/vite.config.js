import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'http://localhost:8000';

const SILENT_PROXY_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT']);

function isSilentProxyError(err) {
  if (!err) return true;
  if (SILENT_PROXY_CODES.has(err.code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('socket has been ended') ||
    msg.includes('ended by the other party') ||
    msg.includes('writeafterfin')
  );
}

// Shared proxy options — quiet when backend is starting or reloading
const proxyOpts = (ws = false) => ({
  target: BACKEND,
  changeOrigin: true,
  ws,
  proxyTimeout: 30000,
  timeout: 30000,
  configure: (proxy) => {
    proxy.on('error', (err, _req, res) => {
      if (isSilentProxyError(err)) return;
      console.error('[proxy]', err.message);
      if (res && typeof res.writeHead === 'function' && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Backend unavailable. Retrying...' }));
      }
    });

    if (ws) {
      proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
        socket.on('error', () => {});
      });
      proxy.on('close', () => {});
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/twin-chat': proxyOpts(true),
      '/agent/ws':  proxyOpts(true),
      '/auth':          proxyOpts(),
      '/ai':            proxyOpts(),
      '/gmail':         proxyOpts(),
      '/calendar':      proxyOpts(),
      '/sessions':      proxyOpts(),
      '/history':       proxyOpts(),
      '/analytics':     proxyOpts(),
      '/activity':      proxyOpts(),
      '/agent':         proxyOpts(),
      '/mcp':           proxyOpts(),
      '/intelligence':  proxyOpts(),
      '/test-telegram': proxyOpts(),
      '/settings':      proxyOpts(),
      '/integrations':  proxyOpts(),
      '/oauth':         proxyOpts(),
      '/memory':        proxyOpts(),
      '/admin':         proxyOpts(),
    },
  },
})
