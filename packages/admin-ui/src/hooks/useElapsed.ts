import { useState, useEffect, useRef } from 'react';

/** Returns elapsed seconds since `running` became true. Resets to 0 when false. */
export function useElapsed(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running) { startRef.current = null; queueMicrotask(() => setElapsed(0)); return; }
    if (startRef.current === null) startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current!) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return elapsed;
}
