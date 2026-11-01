import { useCallback, useEffect, useRef, useState } from "react";

// Small data-loading hook: { data, loading, error, reload(silent?) }. Ignores stale responses.
export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === seq.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error }));
    }
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
