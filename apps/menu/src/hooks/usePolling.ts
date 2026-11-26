import { useEffect, useRef } from 'react';

/** Runs `fn` now and then every `everyMs`, only while `active`. Stops the moment `active` turns false. */
export function usePolling(active: boolean, fn: () => void, everyMs: number): void {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    latest.current();
    const id = setInterval(() => latest.current(), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
}
