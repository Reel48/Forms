/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Reel48 Brand Color
        'reel48-blue': {
          DEFAULT: '#1B2B41',
          light: 'rgba(27, 43, 65, 0.1)',
          hover: '#15202e',
          50: 'rgba(27, 43, 65, 0.05)',
          100: 'rgba(27, 43, 65, 0.1)',
          200: 'rgba(27, 43, 65, 0.2)',
          300: 'rgba(27, 43, 65, 0.3)',
          400: '#253a57',
          500: '#1B2B41',
          600: '#15202e',
          700: '#0f151b',
          800: '#0a0f14',
          900: '#05080a',
        },
      },
    },
  },
  plugins: [],
}

