import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

const LIVE_MS = 30000;

/**
 * Loads data and keeps { data, loading, error } in step. A response that arrives after a newer
 * request has started is dropped, so fast filter changes never show stale results.
 *
 * `{ live: true }` keeps the data fresh: it re-fetches quietly (no loading state) every 30 s while
 * the tab is visible and as soon as the person returns to the tab. Used where other people's
 * actions change what is shown — a doctor cancelling, the scheduler moving a booking.
 */
export function useAsync(loader, deps = [], { live = false } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const latest = useRef(0);

  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++latest.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await loader();
      if (id === latest.current) setState({ data: res?.data?.data ?? res, meta: res?.data?.meta ?? null, loading: false, error: null });
    } catch (err) {
      // A failed background refresh keeps what is on screen.
      if (id === latest.current && !silent) setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  useEffect(() => {
    if (!live) return undefined;
    const refresh = () => document.visibilityState === 'visible' && run({ silent: true });
    const timer = setInterval(refresh, LIVE_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [live, run]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);

  return { ...state, reload: run, setData };
}
