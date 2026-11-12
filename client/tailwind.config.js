/** @type {import('tailwindcss').Config} */
export default {
  // The theme toggle sets the `dark` class on <html>.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      // Theme-aware colours backed by the CSS variables in index.css: text-ink, bg-surface, border-line, …
      colors: {
        canvas: 'var(--bg-main)',
        surface: { DEFAULT: 'var(--surface)', raised: 'var(--surface-raised)' },
        subtle: 'var(--bg-subtle)',
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        ink: { DEFAULT: 'var(--text-primary)', 2: 'var(--text-secondary)', 3: 'var(--text-muted)' },
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' },
        // Clinical blue. The single action colour, in light and dark.
        brand: { 50: '#eff4ff', 100: '#e8effd', 200: '#c9d8fb', 300: '#9db9f7', 400: '#6ea0ff', 500: '#3b78f0', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#0f1d4a' }
      }
    }
  },
  plugins: []
};
