import { useState, useEffect } from 'react';
import { useAuth } from '../auth-context.js';

export interface LogEntry {
  line: string;
  receivedAt: number; // Date.now()
}

interface LogStreamState {
  logs: LogEntry[];
  connected: boolean;
  error: string | null;
}

export function useLogStream(appName: string, active: boolean): LogStreamState {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiFetch } = useAuth();

  useEffect(() => {
    if (!active || !appName) return;
    let es: EventSource | null = null;
    let cancelled = false;

    (async () => {
      try {
        const tokenRes = await apiFetch(`/api/apps/${encodeURIComponent(appName)}/logs/token`);
        if (!tokenRes.ok || cancelled) return;
        const { token } = (await tokenRes.json()) as { token: string };
        if (cancelled) return;

        const url = `/api/apps/${encodeURIComponent(appName)}/logs?token=${token}`;
        es = new EventSource(url);

        es.addEventListener('open', () => {
          setConnected(true);
          setError(null);
        });

        es.addEventListener('message', (e: MessageEvent<string>) => {
          const entry: LogEntry = { line: e.data, receivedAt: Date.now() };
          setLogs((prev) => [...prev.slice(-500), entry]);
        });

        es.addEventListener('error', () => {
          setConnected(false);
          // Close immediately — the token is one-time-use and already consumed, so the
          // browser's built-in EventSource auto-reconnect would retry with a stale token
          // and receive 401 in a tight loop.
          es?.close();
          setError('로그 스트림 연결이 끊겼습니다. 모달을 닫고 다시 열어주세요.');
        });
      } catch {
        if (!cancelled) setError('로그 스트림 연결 실패');
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
    // apiFetch is stable (useCallback) — no need to list in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName, active]);

  return { logs, connected, error };
}
