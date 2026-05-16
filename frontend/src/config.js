/**
 * Centralized configuration for the AI Twin frontend.
 * Reads from Vite environment variables with sensible defaults.
 *
 * In development: leave VITE_API_BASE unset — Vite proxy handles routing
 *   all /ai, /sessions, /history, etc. to localhost:8000 transparently.
 *
 * In production, set in .env:
 *   VITE_API_BASE=https://your-railway-backend.up.railway.app
 */
export const API_BASE =
    (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL)?.replace(/\/+$/, '') || ''
