/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Reel48 Brand Color (Reel48 Black)
        'reel48-blue': {
          DEFAULT: '#292c2f',
          light: 'rgba(41, 44, 47, 0.1)',
          hover: '#1f2124',
          50: 'rgba(41, 44, 47, 0.05)',
          100: 'rgba(41, 44, 47, 0.1)',
          200: 'rgba(41, 44, 47, 0.2)',
          300: 'rgba(41, 44, 47, 0.3)',
          400: '#232629',
          500: '#292c2f',
          600: '#1f2124',
          700: '#1a1c1e',
          800: '#151618',
          900: '#0f1011',
        },
      },
    },
  },
  plugins: [],
}

