/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        violet: { DEFAULT: '#7c3aed' },
        rose: { DEFAULT: '#e11d6e' },
      },
      borderRadius: {
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
}
