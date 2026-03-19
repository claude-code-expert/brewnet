import { useState, useEffect, useRef, useCallback } from 'react';
import type { LogEntry, LogStatsResponse } from '../types.js';

interface LogsTabProps {
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

type LevelFilter = 'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
type SourceFilter = 'all' | 'cli' | 'tunnel' | 'access' | 'service';

function levelBadgeStyle(level: LogEntry['level']): React.CSSProperties {
  switch (level) {
    case 'info':  return { color: 'var(--green)', background: 'rgba(61,232,154,0.08)', border: '1px solid rgba(61,232,154,0.18)' };
    case 'warn':  return { color: 'var(--amber)', background: 'rgba(232,168,73,0.08)', border: '1px solid rgba(232,168,73,0.18)' };
    case 'error': return { color: 'var(--red)',   background: 'rgba(240,75,90,0.08)',  border: '1px solid rgba(240,75,90,0.18)' };
    case 'debug': return { color: 'var(--txt3)',  background: 'rgba(58,80,112,0.12)',  border: '1px solid var(--bdr)' };
    default:      return { color: 'var(--txt2)' };
  }
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' +
      String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return ts;
  }
}

export function LogsTab({ apiFetch }: LogsTabProps) {
  const [stats, setStats] = useState<LogStatsResponse | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<SourceFilter>('all');
  const [level, setLevel] = useState<LevelFilter>('ALL');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (source !== 'all') params.set('source', source);
      if (level !== 'ALL') params.set('level', level.toLowerCase());
      if (search) params.set('search', search);

      const [statsRes, logsRes] = await Promise.all([
        apiFetch('/api/logs/stats'),
        apiFetch(`/api/logs?${params.toString()}`),
      ]);

      if (statsRes.ok) {
        const d = await statsRes.json() as LogStatsResponse;
        setStats(d);
      }
      if (logsRes.ok) {
        const d = await logsRes.json() as { entries: LogEntry[]; total: number; hasMore: boolean };
        setEntries(d.entries ?? []);
        setTotal(d.total ?? 0);
      }
    } catch (err) {
      console.warn('[LogsTab] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, source, level, search]);

  // Initial fetch + re-fetch on filter change
  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) {
      intervalRef.current = setInterval(() => { void fetchLogs(); }, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  const handleSearch = () => {
    setSearch(searchInput);
  };

  const levelButtons: LevelFilter[] = ['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="sbox" style={{ minWidth: 100 }}>
            <div className="sk">Total</div>
            <div className="sv">{stats.total}</div>
          </div>
          {stats.byLevel && Object.entries(stats.byLevel).map(([l, n]) => (
            <div className="sbox" key={l} style={{ minWidth: 80 }}>
              <div className="sk">{l.toUpperCase()}</div>
              <div
                className="sv"
                style={{
                  color: l === 'error' ? 'var(--red)'
                    : l === 'warn' ? 'var(--amber)'
                    : l === 'info' ? 'var(--green)'
                    : 'var(--txt3)',
                }}
              >
                {n}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--bdr)',
          borderRadius: 'var(--r2)',
          padding: '14px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {/* Source dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>SOURCE</span>
          <select
            className="fi"
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
            value={source}
            onChange={(e) => setSource(e.target.value as SourceFilter)}
          >
            <option value="all">All</option>
            <option value="cli">CLI</option>
            <option value="tunnel">Tunnel</option>
            <option value="access">Access</option>
            <option value="service">Service</option>
          </select>
        </div>

        {/* Level buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>LEVEL</span>
          {levelButtons.map((l) => (
            <button
              key={l}
              className={`btn bsm ${level === l ? 'bp' : 'bg'}`}
              style={level !== l ? { fontSize: 11, padding: '4px 10px' } : { fontSize: 11, padding: '4px 10px' }}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
          <input
            className="fi"
            style={{ flex: 1, padding: '6px 11px', fontSize: 12 }}
            placeholder="Search messages…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button className="btn bg bsm" onClick={handleSearch}>Search</button>
        </div>

        {/* Auto-refresh */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--txt2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ accentColor: 'var(--amber)' }}
          />
          Auto-refresh (5s)
        </label>

        {loading && (
          <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>loading…</span>
        )}
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
        Showing {entries.length} of {total} entries
      </div>

      {/* Table */}
      <div className="rtbl-wrap">
        <table className="rtbl">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Time</th>
              <th style={{ width: 70 }}>Level</th>
              <th style={{ width: 90 }}>Source</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--txt3)', padding: '32px 0' }}>
                  No log entries found
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => (
                <tr key={`${entry.ts}-${i}`}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>
                    {formatTs(entry.ts)}
                  </td>
                  <td>
                    <span
                      className="bdg"
                      style={{ ...levelBadgeStyle(entry.level), fontSize: 10, padding: '2px 7px' }}
                    >
                      {entry.level.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--txt2)' }}>
                    {entry.source}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--txt)', wordBreak: 'break-word' }}>
                    {entry.message}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
