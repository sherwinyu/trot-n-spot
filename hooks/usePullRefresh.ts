import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep a user-requested refresh visible long enough to see Dudley. */
export function usePullRefresh(refresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    // Start both together: fast responses update data immediately, and slow
    // responses do not get an extra two seconds added after they finish.
    const minimumDisplay = new Promise<void>(resolve => setTimeout(resolve, 2000));
    try {
      await refresh();
    } finally {
      await minimumDisplay;
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [refresh]);

  return { refreshing, onRefresh };
}
