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
          DEFAULT: '#1D2134',
          light: 'rgba(29, 33, 52, 0.1)',
          hover: '#151822',
          50: 'rgba(29, 33, 52, 0.05)',
          100: 'rgba(29, 33, 52, 0.1)',
          200: 'rgba(29, 33, 52, 0.2)',
          300: 'rgba(29, 33, 52, 0.3)',
          400: '#2a2f47',
          500: '#1D2134',
          600: '#151822',
          700: '#0f1118',
          800: '#0a0c0f',
          900: '#050607',
        },
      },
    },
  },
  plugins: [],
}

