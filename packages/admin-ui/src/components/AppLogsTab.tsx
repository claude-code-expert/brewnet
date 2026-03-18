// T038 — AppLogsTab: SSE log stream for a deployed app
import { useEffect, useRef } from 'react';
import { useLogStream } from '../hooks/useLogStream.js';

interface AppLogsTabProps {
  appName: string;
}

// Extract leading timestamp from a log line (e.g. "2026-03-18T12:00:00.000Z some message")
function splitLogLine(line: string): { ts: string | null; rest: string } {
  // ISO timestamp pattern at start of line
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*(.*)/);
  if (m) {
    return { ts: m[1], rest: m[2] };
  }
  return { ts: null, rest: line };
}

function formatLogTs(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  } catch {
    return iso;
  }
}

export function AppLogsTab({ appName }: AppLogsTabProps) {
  const { logs, connected } = useLogStream(appName, true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
          — {appName} live logs
        </span>
      </div>

      {/* Log output */}
      <div style={{
        background: 'var(--bg0)',
        border: '1px solid var(--bdr)',
        borderRadius: 4,
        padding: '8px 12px',
        height: 400,
        overflowY: 'auto',
        fontSize: 12,
        color: 'var(--txt2)',
        fontFamily: 'var(--mono)',
        lineHeight: 1.7,
      }}>
        {logs.length === 0 ? (
          <span style={{ color: 'var(--txt3)', fontStyle: 'italic' }}>
            {connected ? 'Waiting for logs…' : 'Connecting…'}
          </span>
        ) : (
          logs.map((line, i) => {
            const { ts, rest } = splitLogLine(line);
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {ts && (
                  <span style={{ color: 'var(--txt3)', flexShrink: 0, fontSize: 11 }}>
                    {formatLogTs(ts)}
                  </span>
                )}
                <span style={{ wordBreak: 'break-all' }}>{rest}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--txt3)' }}>
        Showing last {Math.min(logs.length, 500)} lines
      </div>
    </div>
  );
}
