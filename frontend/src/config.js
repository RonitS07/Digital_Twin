/**
 * Centralized configuration for the AI Twin frontend.
 * Reads from Vite environment variables with sensible defaults.
 *
 * Usage:
 *   import { API_BASE } from '../config'
 *   fetch(`${API_BASE}/ai/process`, ...)
 *
 * To override in production, create a .env file at the frontend root:
 *   VITE_API_BASE=https://api.yourdomain.com
 */
export const API_BASE =
    import.meta.env.VITE_API_BASE?.replace(/\/+$/, '') || 'http://127.0.0.1:8000'
