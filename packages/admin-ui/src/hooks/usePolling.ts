import { useEffect } from 'react';

type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function usePolling(
  url: string,
  intervalMs: number,
  apiFetch: ApiFetch,
  onData: (data: unknown) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await apiFetch(url);
        if (!cancelled && res.ok) {
          const data: unknown = await res.json();
          if (!cancelled) onData(data);
        }
      } catch {
        // silent — retry on next interval
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs, enabled]);
}
