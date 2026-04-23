/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#07090d',
          900: '#0b0f16',
          800: '#111722',
          700: '#1a2130',
          600: '#232c3d',
          500: '#2f3a4f',
        },
        accent: {
          DEFAULT: '#d4af37',
          soft: '#b8963a',
        },
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 0 0 1px rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
}
