import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

/**
 * Loads data and keeps { data, loading, error } in step. A response that arrives after a newer
 * request has started is dropped, so fast filter changes never show stale results.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const latest = useRef(0);

  const run = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await loader();
      if (id === latest.current) setState({ data: res?.data?.data ?? res, meta: res?.data?.meta ?? null, loading: false, error: null });
    } catch (err) {
      if (id === latest.current) setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);

  return { ...state, reload: run, setData };
}
