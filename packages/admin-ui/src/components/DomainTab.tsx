// T039 — DomainTab: connect/disconnect custom domain for an app
import { useState, useEffect, useCallback } from 'react';
import type { DomainConnection } from '../types.js';
import { showToast } from './Toast.js';

type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

interface DomainTabProps {
  appName: string;
  apiFetch: ApiFetch;
}

export function DomainTab({ appName, apiFetch }: DomainTabProps) {
  const [connections, setConnections]     = useState<DomainConnection[]>([]);
  const [loadingList, setLoadingList]     = useState(true);
  const [hostname, setHostname]           = useState('');
  const [connecting, setConnecting]       = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadDomainList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await apiFetch('/api/domain/list');
      if (res.ok) {
        const data = await res.json() as {
          connections?: DomainConnection[];
          domainConnections?: DomainConnection[];
        };
        setConnections(data.connections ?? data.domainConnections ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoadingList(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadDomainList();
  }, [loadDomainList]);

  // Connected domain for this app (if any)
  const connectedDomain = connections.find((c) => c.appName === appName) ?? null;

  const handleConnect = async () => {
    const trimmed = hostname.trim();
    if (!trimmed) {
      showToast('Please enter a hostname');
      return;
    }
    setConnecting(true);
    try {
      const res = await apiFetch('/api/domain/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName, hostname: trimmed }),
      });
      if (res.ok) {
        showToast(`Domain "${trimmed}" connected`);
        setHostname('');
        await loadDomainList();
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        showToast(`Error: ${err.error ?? res.statusText}`);
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connectedDomain) return;
    if (!window.confirm(`Disconnect domain "${connectedDomain.hostname}" from "${appName}"?`)) return;
    setDisconnecting(true);
    try {
      const res = await apiFetch(`/api/domain/disconnect/${encodeURIComponent(appName)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('Domain disconnected');
        await loadDomainList();
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        showToast(`Error: ${err.error ?? res.statusText}`);
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Connected Domain */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Connected Domain</div>

        {loadingList ? (
          <div style={{ color: 'var(--txt3)', fontSize: 13 }}>Loading…</div>
        ) : connectedDomain ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <a
                href={`https://${connectedDomain.hostname}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}
              >
                {connectedDomain.hostname}
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--txt3)' }}>↗</span>
              </a>
              {connectedDomain.connectedAt && (
                <span style={{ fontSize: 11.5, color: 'var(--txt3)' }}>
                  Connected {new Date(connectedDomain.connectedAt).toLocaleString()}
                </span>
              )}
            </div>
            <button
              className="btn br bsm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{ opacity: disconnecting ? 0.6 : 1 }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div style={{ color: 'var(--txt3)', fontSize: 13, fontStyle: 'italic' }}>
            No domain connected to this app
          </div>
        )}
      </div>

      {/* Connect Domain */}
      {!connectedDomain && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Connect Domain</div>
          <div style={{ fontSize: 12.5, color: 'var(--txt3)', marginBottom: 16 }}>
            Enter the hostname you want to connect (e.g.{' '}
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>myapp.example.com</span>)
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="myapp.example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
              style={{
                background: 'var(--bg0)',
                border: '1px solid var(--bdr2)',
                borderRadius: 'var(--r)',
                padding: '8px 12px',
                color: 'var(--txt)',
                fontSize: 13,
                fontFamily: 'var(--mono)',
                outline: 'none',
                minWidth: 260,
                flex: '1 1 260px',
                maxWidth: 400,
              }}
            />
            <button
              className="btn bp bsm"
              onClick={handleConnect}
              disabled={connecting || !hostname.trim()}
              style={{ opacity: connecting || !hostname.trim() ? 0.6 : 1 }}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {/* All Domain Connections (informational) */}
      {connections.length > 0 && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-title" style={{ marginBottom: 12 }}>All Domain Connections</div>
          <div className="rtbl-wrap">
            <table className="rtbl">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Hostname</th>
                  <th>Connected At</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c, i) => (
                  <tr key={i} style={{ background: c.appName === appName ? 'rgba(61,214,200,0.04)' : undefined }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {c.appName}
                      {c.appName === appName && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--teal)' }}>← this app</span>
                      )}
                    </td>
                    <td>
                      <a
                        href={`https://${c.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 12, textDecoration: 'none' }}
                      >
                        {c.hostname}
                      </a>
                    </td>
                    <td style={{ color: 'var(--txt2)', fontSize: 12 }}>
                      {c.connectedAt ? new Date(c.connectedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
