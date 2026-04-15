/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#6760fd",
        "secondary": "#c3c0ff",
        "tertiary": "#ffb695",
        "neutral": "#777681",
        "surface": "#13121b",
        "surface-base": "#13121b",
        "surface-container": "#1f1f28",
        "surface-container-low": "#1b1b24",
        "surface-container-high": "#2a2933",
        "surface-container-highest": "#35343e",
        "on-surface": "#e4e1ee",
        "on-surface-variant": "#c7c4d8",
        "outline": "#918fa1",
        "outline-variant": "#464555",
      },
      fontFamily: {
        manrope: ['Manrope', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '2rem',
        '3xl': '3rem',
      },
      backdropBlur: {
        '40': '40px',
      }
    },
  },
  plugins: [],
}
