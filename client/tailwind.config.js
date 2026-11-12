/** @type {import('tailwindcss').Config} */
export default {
  // The theme toggle sets the `dark` class on <html>.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      // Theme-aware colours backed by the CSS variables in index.css: text-ink, bg-surface, border-line, …
      colors: {
        canvas: 'var(--bg-main)',
        surface: { DEFAULT: 'var(--surface)', raised: 'var(--surface-raised)' },
        subtle: 'var(--bg-subtle)',
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        ink: { DEFAULT: 'var(--text-primary)', 2: 'var(--text-secondary)', 3: 'var(--text-muted)' },
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' }
      }
    }
  },
  plugins: []
};
