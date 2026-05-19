/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#74A5A8',
          50: '#E8F0F0',
          100: '#D1E1E2',
          200: '#A3C3C5',
          300: '#75A5A8',
          400: '#5B8D90',
          500: '#3D6E72',
          600: '#2A5255',
          700: '#1D3B3D',
        },
        secondary: {
          DEFAULT: '#9BB88D',
        }
      }
    },
  },
  plugins: [],
}
