// T033 — SettingsTab: Cloudflare tunnel settings form
import { useState, useEffect } from 'react';
import { showToast } from './Toast.js';

interface CloudflareSettings {
  token?: string;
  accountId?: string;
  zoneId?: string;
  tunnelName?: string;
}

interface SettingsTabProps {
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export function SettingsTab({ apiFetch }: SettingsTabProps) {
  const [settings, setSettings] = useState<CloudflareSettings>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Form state
  const [token, setToken]           = useState('');
  const [accountId, setAccountId]   = useState('');
  const [zoneId, setZoneId]         = useState('');
  const [tunnelName, setTunnelName] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/api/settings/cloudflare');
        if (!res.ok) {
          setError(`Failed to load settings: ${res.status}`);
          return;
        }
        const data = await res.json() as CloudflareSettings;
        setSettings(data);
        setToken(data.token ?? '');
        setAccountId(data.accountId ?? '');
        setZoneId(data.zoneId ?? '');
        setTunnelName(data.tunnelName ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/settings/cloudflare', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accountId, zoneId, tunnelName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        setError(err.error ?? res.statusText);
        return;
      }
      setSettings({ token, accountId, zoneId, tunnelName });
      showToast('Cloudflare settings saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--txt2)', padding: '40px 0' }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
        Loading settings…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>Cloudflare Tunnel</div>
        <div style={{ fontSize: 12.5, color: 'var(--txt3)', marginTop: 4 }}>
          Configure Cloudflare Tunnel for external access to your services.
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--r)',
          background: 'rgba(240,75,90,0.07)',
          border: '1px solid rgba(240,75,90,0.2)',
          color: 'var(--red)',
          fontSize: 12.5,
          fontFamily: 'var(--mono)',
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">CF API Token</label>
          <input
            className="fi"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cloudflare API token…"
            autoComplete="new-password"
          />
          <div className="fhint">
            Requires Cloudflare Tunnel:Edit + DNS:Edit permissions.
          </div>
        </div>

        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Account ID</label>
          <input
            className="fi"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="e.g. abc123def456…"
          />
        </div>

        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Zone ID</label>
          <input
            className="fi"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            placeholder="e.g. 789xyz…"
          />
        </div>

        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Tunnel Name</label>
          <input
            className="fi"
            value={tunnelName}
            onChange={(e) => setTunnelName(e.target.value)}
            placeholder="e.g. my-homeserver"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button
            type="submit"
            className="btn bp"
            disabled={saving}
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {saving
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span> Saving…</>
              : 'Save Settings'}
          </button>
          <button
            type="button"
            className="btn bg"
            onClick={() => {
              setToken(settings.token ?? '');
              setAccountId(settings.accountId ?? '');
              setZoneId(settings.zoneId ?? '');
              setTunnelName(settings.tunnelName ?? '');
              setError(null);
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
