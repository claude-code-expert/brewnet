import { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (!active || !appName) return;

    const url = `/api/apps/${encodeURIComponent(appName)}/logs`;
    const es = new EventSource(url);

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
