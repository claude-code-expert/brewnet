// features/domain/components/AppDomainTab.tsx — Per-app domain connection panel
// Includes US2 (connect) and US3 (disconnect) flows.

import { useState } from 'react';
import { Settings, Unlink, Link, Loader, HelpCircle, Globe } from 'lucide-react';
import type { ApiFetch } from '../types.js';
import { useAppDomain } from '../hooks/useAppDomain.js';
import { HelpTooltip } from './HelpTooltip.js';
import { HelpDrawer } from './HelpDrawer.js';
import { ConfirmModal } from '../../../components/ConfirmModal.js';
import { CopyButton } from '../../../components/ServiceCard.js';

interface AppDomainTabProps {
  appName: string;
  apiFetch: ApiFetch;
  appStatus?: string;
  onOpenDomainSettings?: () => void;
}

export function AppDomainTab({ appName, apiFetch, appStatus, onOpenDomainSettings }: AppDomainTabProps) {
  const [helpKey, setHelpKey] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<'subdomain' | 'apex'>('subdomain');
  const hook = useAppDomain(appName, apiFetch);
  const {
    loading,
    connectedDomain,
    cfConfigured,
    zoneName,
    subdomain,
    setSubdomain,
    subdomainError,
    suggestedSubdomain,
    connecting,
    disconnecting,
    connect,
    disconnect,
  } = hook;

  const handleModeChange = (mode: 'subdomain' | 'apex') => {
    setConnectionMode(mode);
    setSubdomain(mode === 'apex' ? '@' : suggestedSubdomain);
  };

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // CF not configured — step-by-step setup guide
  if (!loading && !cfConfigured) {
    const steps = [
      { num: 1, label: 'API Token', desc: 'Cloudflare API Token 발급 및 검증' },
      { num: 2, label: 'Zone', desc: '사용할 도메인(Zone) 선택' },
      { num: 3, label: 'Tunnel', desc: 'Cloudflare Tunnel 생성' },
    ];
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(61,214,200,0.1)', border: '1px solid rgba(61,214,200,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Globe size={16} style={{ color: 'var(--teal)' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>
                Public Domain Not Configured
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.6 }}>
                공인 IP나 포트포워딩 없이 앱을 외부 도메인으로 공개하려면 Cloudflare Tunnel 설정이 필요합니다.
                설정은 최초 1회만 필요하며, 이후 앱마다 서브도메인만 연결하면 됩니다.
              </div>
            </div>
          </div>

          {/* Step list */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 'var(--r)',
            background: 'var(--bg0)',
            border: '1px solid var(--bdr)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', marginBottom: 2 }}>
              SETUP REQUIRED — 3 STEPS
            </div>
            {steps.map((s) => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(232,168,73,0.12)',
                  border: '1px solid rgba(232,168,73,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--mono)',
                }}>
                  {s.num}
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--txt2)', marginLeft: 8 }}>— {s.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {onOpenDomainSettings && (
              <button className="btn bp" onClick={onOpenDomainSettings} style={{ flexShrink: 0 }}>
                <Settings size={14} /> Open Domain Settings
              </button>
            )}
            <button
              type="button"
              onClick={() => setHelpKey('cloudflare-setup')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: '1px solid var(--bdr)',
                borderRadius: 'var(--r)', padding: '7px 12px',
                cursor: 'pointer', color: 'var(--txt2)', fontSize: 12.5,
              }}
            >
              <HelpCircle size={13} /> 설정 가이드 보기
            </button>
          </div>
        </div>

        <HelpDrawer helpKey={helpKey} onClose={() => setHelpKey(null)} />
      </>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--txt2)', fontSize: 13, padding: '20px 0' }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
        Loading domain info…
      </div>
    );
  }

  // Connected state
  if (connectedDomain) {
    const externalUrl = connectedDomain.externalUrl ?? `https://${connectedDomain.hostname}`;
    const isApexConn = connectedDomain.subdomain === '@';
    const wwwUrl = isApexConn ? `https://www.${connectedDomain.domain}` : null;
    const disconnectMsg = isApexConn
      ? `This will remove the DNS records for "${connectedDomain.hostname}" and "www.${connectedDomain.domain}". The app will no longer be publicly accessible.`
      : `This will remove the DNS record for "${connectedDomain.hostname}" and the app will no longer be publicly accessible.`;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Connected URL card */}
        <div style={{
          padding: '16px 20px',
          borderRadius: 'var(--r)',
          background: 'rgba(61,214,200,0.05)',
          border: '1px solid rgba(61,214,200,0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--teal)',
                fontFamily: 'var(--mono)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {connectedDomain.hostname}
              <span style={{ marginLeft: 4, fontSize: 11 }}>↗</span>
            </a>
            <CopyButton text={externalUrl} />
          </div>
          {wwwUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <a
                href={wwwUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--teal)',
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                www.{connectedDomain.domain}
                <span style={{ marginLeft: 4, fontSize: 11 }}>↗</span>
              </a>
              <CopyButton text={wwwUrl} />
            </div>
          )}
          {connectedDomain.connectedAt && (
            <span style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
              Connected {new Date(connectedDomain.connectedAt).toLocaleString()}
            </span>
          )}
        </div>

        {/* Disconnecting state */}
        {disconnecting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--txt2)', fontSize: 13 }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
            Removing DNS record{isApexConn ? 's' : ''}…
          </div>
        ) : (
          <button
            className="btn bg"
            onClick={() => setConfirmDisconnect(true)}
            style={{ alignSelf: 'flex-end', color: 'var(--red)' }}
          >
            <Unlink size={14} /> Disconnect
          </button>
        )}

        {/* Disconnect confirm modal */}
        {confirmDisconnect && (
          <ConfirmModal
            message={disconnectMsg}
            confirmLabel="Disconnect"
            danger
            onConfirm={() => { setConfirmDisconnect(false); void disconnect(); }}
            onCancel={() => setConfirmDisconnect(false)}
          />
        )}
      </div>
    );
  }

  // Not connected — show connection mode selector and input
  const isDisabled = connecting || (!!appStatus && appStatus !== 'running');
  const connectDisabled = isDisabled ||
    (connectionMode === 'subdomain' && (!subdomain.trim() || !!subdomainError));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* What will happen info */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 14px',
        borderRadius: 'var(--r)',
        background: 'rgba(61,214,200,0.04)',
        border: '1px solid rgba(61,214,200,0.12)',
      }}>
        <Globe size={14} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>
          Connect this app to a domain on{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>
            {zoneName || 'your domain'}
          </span>.{' '}
          Cloudflare DNS CNAME 레코드와 Tunnel ingress 규칙이 자동으로 생성됩니다.
        </div>
      </div>

      {/* Connection mode radio */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="radio"
            checked={connectionMode === 'subdomain'}
            onChange={() => handleModeChange('subdomain')}
            disabled={connecting}
          />
          <span style={{ fontWeight: 500, color: 'var(--txt)' }}>Subdomain</span>
          <HelpTooltip helpKey="subdomain" onHelp={setHelpKey} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="radio"
            checked={connectionMode === 'apex'}
            onChange={() => handleModeChange('apex')}
            disabled={connecting}
          />
          <span style={{ fontWeight: 500, color: 'var(--txt)' }}>Root domain</span>
        </label>
      </div>

      {/* Subdomain input */}
      {connectionMode === 'subdomain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="fi"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !connecting) void connect(); }}
              placeholder={`e.g. ${appName.toLowerCase()}`}
              disabled={connecting}
              style={{
                borderColor: subdomainError ? 'var(--red)' : undefined,
                fontFamily: 'var(--mono)',
                width: 150,
                height: 30,
                padding: '0 10px',
                flexShrink: 0,
              }}
            />
            {zoneName && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 30,
                padding: '0 10px',
                background: 'var(--bg2)',
                border: '1px solid var(--bdr)',
                borderRadius: 'var(--r)',
                fontSize: 13,
                color: 'var(--txt2)',
                fontFamily: 'var(--mono)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}>
                .{zoneName}
              </span>
            )}
          </div>
          {subdomainError && (
            <div style={{ fontSize: 12, color: 'var(--red)' }}>{subdomainError}</div>
          )}
        </div>
      )}

      {/* Apex info */}
      {connectionMode === 'apex' && zoneName && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 'var(--r)',
          background: 'rgba(232,168,73,0.06)',
          border: '1px solid rgba(232,168,73,0.2)',
          fontSize: 13,
        }}>
          <div style={{ color: 'var(--txt)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{zoneName}</span>
            {' '}과{' '}
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>www.{zoneName}</span>
            {' '}이 모두 연결됩니다.
          </div>
          <div style={{ color: 'var(--amber)', marginTop: 4, fontSize: 12 }}>
            ⚠ 이 도메인의 모든 트래픽이 이 앱으로 라우팅됩니다.
          </div>
        </div>
      )}

      {!subdomainError && appStatus && appStatus !== 'running' && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>
          App must be running to connect a domain — start the app first.
        </div>
      )}

      <button
        className="btn bp"
        onClick={() => void connect()}
        disabled={connectDisabled}
        style={{ opacity: connectDisabled ? 0.5 : 1, alignSelf: 'flex-start' }}
      >
        {connecting
          ? <><Loader size={14} className="spin" /> Connecting…</>
          : <><Link size={14} /> Connect</>}
      </button>

      <HelpDrawer helpKey={helpKey} onClose={() => setHelpKey(null)} />
    </div>
  );
}
