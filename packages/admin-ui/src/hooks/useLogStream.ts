import { useState, useEffect } from 'react';

interface LogStreamState {
  logs: string[];
  connected: boolean;
  error: string | null;
}

export function useLogStream(appName: string, active: boolean): LogStreamState {
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !appName) return;

    const token = sessionStorage.getItem('adminPassword') ?? '';
    const url = `/api/apps/${encodeURIComponent(appName)}/logs${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(url);

    es.addEventListener('open', () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener('message', (e: MessageEvent<string>) => {
      setLogs((prev) => [...prev.slice(-500), e.data]);
    });

    es.addEventListener('error', () => {
      setConnected(false);
      if (es.readyState === EventSource.CLOSED) {
        setError('연결이 끊겼습니다. 재연결 중...');
      }
    });

    return () => {
      es.close();
    };
  }, [appName, active]);

  return { logs, connected, error };
}
