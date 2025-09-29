/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      container: { center: true, padding: '1rem', screens: { lg: '1024px', xl: '1280px', '2xl': '1536px' } },
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        success: { 50: '#f0fdf4', 500: '#22c55e' },
        warning: { 50: '#fffbeb', 500: '#f59e0b' },
        error:   { 50: '#fef2f2', 500: '#ef4444' },
      },
    },
  },
  plugins: [
    // npm i -D @tailwindcss/forms @tailwindcss/typography @tailwindcss/aspect-ratio
    // require('@tailwindcss/forms'),
    // require('@tailwindcss/typography'),
    // require('@tailwindcss/aspect-ratio'),
  ],
  // safelist: [{ pattern: /(bg|text|border)-(primary|success|warning|error)-(50|500|600|700)/ }],
}