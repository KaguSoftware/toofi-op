import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "Now" on the SERVER's clock. A phone's own clock can be minutes off, and the countdown
 * (call again in 1:42) and the strip that times out are measured in server timestamps.
 * The first render uses the server's time so server and client markup match; `sync` takes
 * the server's time from an answer that carries it; `tick` moves `now` on by the phone's
 * own elapsed time (drive it with usePolling while something on screen depends on the clock).
 */
export function useServerClock(initialServerNow: number): { now: number; sync: (serverNow: number) => void; tick: () => void } {
  const [now, setNow] = useState(initialServerNow);
  const offset = useRef<number | null>(null);

  useEffect(() => {
    offset.current ??= initialServerNow - Date.now();
  }, [initialServerNow]);

  const sync = useCallback((serverNow: number) => {
    offset.current = serverNow - Date.now();
    setNow(serverNow);
  }, []);
  const tick = useCallback(() => setNow(Date.now() + (offset.current ?? 0)), []);

  return { now, sync, tick };
}
