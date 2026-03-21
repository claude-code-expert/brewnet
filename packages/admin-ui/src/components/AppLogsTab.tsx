// T038 — AppLogsTab: SSE log stream for a deployed app
import { useEffect, useRef, useState } from 'react';
import { useLogStream } from '../hooks/useLogStream.js';

const FIVE_MIN_MS = 5 * 60 * 1000;

interface AppLogsTabProps {
  appName: string;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

export function AppLogsTab({ appName }: AppLogsTabProps) {
  const { logs, connected } = useLogStream(appName, true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Refresh filter every 10s so stale lines drop off automatically
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const recentLogs = logs.filter((e) => now - e.receivedAt <= FIVE_MIN_MS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Connection status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {connected ? (
          <span style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9 }}>●</span> Connected
          </span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9 }}>○</span> Reconnecting...
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--txt2)' }}>
          — {appName} live logs
        </span>
      </div>

      {/* Log output */}
      <div className="cb" style={{ height: 400, overflowY: 'auto', marginTop: 0 }}>
        {recentLogs.length === 0 ? (
          <span style={{ color: 'var(--txt2)', fontStyle: 'italic' }}>
            {connected ? 'Waiting for logs…' : 'Connecting…'}
          </span>
        ) : (
          recentLogs.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--amber)', flexShrink: 0, fontSize: 11, opacity: 0.7 }}>
                {formatTime(entry.receivedAt)}
              </span>
              <span style={{ wordBreak: 'break-all' }}>{entry.line}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
        Last 5 min — {recentLogs.length} lines
      </div>
    </div>
  );
}
