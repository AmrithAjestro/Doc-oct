import { useEffect, useState } from 'react';

const KEY = 'docbook.theme';

const initial = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === 'dark';
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

/** Light/dark theme: toggles the `dark` class on <html> and remembers the choice. */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(initial);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(KEY, isDark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [isDark]);
  return [isDark, setIsDark];
}
