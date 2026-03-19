import { useState, useEffect } from 'react';
import { showToast } from './Toast.js';

interface CloudflareSettings {
  token?: string;
  accountId?: string;
  zoneId?: string;
  tunnelName?: string;
}

interface DomainSettingModalProps {
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}

export function DomainSettingModal({ apiFetch, onClose }: DomainSettingModalProps) {
  const [settings, setSettings] = useState<CloudflareSettings>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [token, setToken]           = useState('');
  const [accountId, setAccountId]   = useState('');
  const [zoneId, setZoneId]         = useState('');
  const [tunnelName, setTunnelName] = useState('');

  useEffect(() => {
    apiFetch('/api/settings/cloudflare')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Failed to load: ${r.status}`)))
      .then((data: unknown) => {
        const d = data as CloudflareSettings;
        setSettings(d);
        setToken(d.token ?? '');
        setAccountId(d.accountId ?? '');
        setZoneId(d.zoneId ?? '');
        setTunnelName(d.tunnelName ?? '');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
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
      showToast('✓ Domain settings saved. Your apps can now be accessed externally via Cloudflare Tunnel.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--bdr)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>
              Cloudflare Domain Settings
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
              Connect your apps to a public domain via Cloudflare Tunnel
            </div>
          </div>
          <button className="xbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--txt2)', padding: '30px 0' }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
              Loading current settings…
            </div>
          ) : (
            <>
              {/* Info banner */}
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--r)',
                background: 'rgba(61,214,200,0.06)',
                border: '1px solid rgba(61,214,200,0.15)',
                fontSize: 12,
                color: 'var(--txt2)',
                marginBottom: 20,
                lineHeight: 1.6,
              }}>
                These credentials allow brewnet to create and manage Cloudflare Tunnels on your behalf.
                You can get them from the <strong style={{ color: 'var(--teal)' }}>Cloudflare Dashboard → My Profile → API Tokens</strong>.
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
                  <label className="fl">Cloudflare API Token</label>
                  <input
                    className="fi"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste your Cloudflare API Token here…"
                    autoComplete="new-password"
                  />
                  <div className="fhint">
                    Required permissions: Cloudflare Tunnel:Edit, DNS:Edit
                  </div>
                </div>

                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Account ID</label>
                  <input
                    className="fi"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="Found in Cloudflare Dashboard → right sidebar"
                  />
                </div>

                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Zone ID</label>
                  <input
                    className="fi"
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    placeholder="Found in Cloudflare Dashboard → your domain → Overview"
                  />
                </div>

                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Tunnel Name</label>
                  <input
                    className="fi"
                    value={tunnelName}
                    onChange={(e) => setTunnelName(e.target.value)}
                    placeholder="A name for this tunnel, e.g. my-homeserver"
                  />
                  <div className="fhint">
                    This name will appear in your Cloudflare Dashboard under Tunnels.
                  </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
