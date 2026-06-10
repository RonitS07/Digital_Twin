/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Warm Intelligence Design System Tokens ──
        "primary": "rgb(var(--primary) / <alpha-value>)",       // terracotta accent
        "secondary": "rgb(var(--secondary) / <alpha-value>)",
        "neutral": "rgb(var(--neutral) / <alpha-value>)",
        "surface": "rgb(var(--surface-container) / <alpha-value>)",
        "surface-base": "rgb(var(--surface-base) / <alpha-value>)",
        "surface-container": "rgb(var(--surface-container) / <alpha-value>)",
        "surface-container-low": "rgb(var(--surface-container-low) / <alpha-value>)",
        "surface-container-high": "rgb(var(--surface-container-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--surface-container-highest) / <alpha-value>)",
        "on-surface": "rgb(var(--on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--on-surface-variant) / <alpha-value>)",
        "outline": "rgb(var(--outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--outline-variant) / <alpha-value>)",

        // ── Semantic colors ──
        "accent": "#2D6A4F",
        "accent-light": "#E8F5EE",
        "wi-success": "#2D6A4F",
        "wi-warning": "#B45309",
        "wi-danger": "#C0392B",

        // ── Sidebar ──
        "sidebar-bg": "#1A1814",
        "sidebar-text": "#C8C2B8",
      },
      fontFamily: {
        // Unified font stack for Warm Intelligence
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        dm: ['DM Sans', 'system-ui', 'sans-serif'],
        fraunces: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
        // Legacy aliases (keep to avoid breaking existing class usage)
        manrope: ['DM Sans', 'system-ui', 'sans-serif'],
        inter: ['DM Sans', 'system-ui', 'sans-serif'],
        outfit: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      boxShadow: {
        'wi-sm': '0 1px 4px rgba(0, 0, 0, 0.05)',
        'wi': '0 4px 12px rgba(0, 0, 0, 0.08)',
        'wi-lg': '0 8px 24px rgba(0, 0, 0, 0.10)',
      },
      animation: {
        'fade-up': 'fadeUp 200ms ease forwards',
        'shimmer': 'shimmer 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          'from': { opacity: '0', transform: 'translateY(8px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
    },
  },
  plugins: [],
}
