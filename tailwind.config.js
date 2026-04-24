/** @type {import('tailwindcss').Config} */
export default {
  // We toggle light/dark by putting a `dark` class on <html>. See
  // src/app/ThemeContext.tsx and the inline anti-FOUC snippet in index.html.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // CSS-variable-backed semantic tokens. The variables themselves are
        // defined in src/index.css, with per-theme values under :root and
        // :root.dark. Using `<alpha-value>` lets Tailwind opacity modifiers
        // (`bg-ink-950/80`, `text-slate-400/70`) keep working unchanged.
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        // Override the slate scale so existing `text-slate-100`, `bg-slate-500`
        // style classes automatically flip with the theme. In light mode we
        // invert the scale so text-slate-100 still reads as "most prominent
        // text," which happens to be dark on a light canvas.
        slate: {
          50:  'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        // `line` is the semantic "divider / overlay" token. Wherever the UI
        // previously used `white/N` for subtle borders or hover-fills, it now
        // uses `line/N`. `line` is white-ish on dark and slate-900-ish on
        // light, so the visual weight stays consistent across themes.
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: {
          DEFAULT: '#d4af37',
          soft: '#b8963a',
        },
      },
      boxShadow: {
        panel: '0 1px 0 0 rgb(var(--line) / 0.03) inset, 0 0 0 1px rgb(var(--line) / 0.04)',
      },
    },
  },
  plugins: [],
}
