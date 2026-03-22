// features/domain/components/CloudflareTunnelModal.tsx — 3-step Cloudflare setup wizard

import { useState } from 'react';
import type { ApiFetch } from '../types.js';
import { useCloudflareSetup } from '../hooks/useCloudflareSetup.js';
import { useAuth } from '../../../auth-context.js';
import { StepIndicator } from './StepIndicator.js';
import { TokenStep } from './TokenStep.js';
import { ZoneStep } from './ZoneStep.js';
import { TunnelStep } from './TunnelStep.js';
import { HelpDrawer } from './HelpDrawer.js';

interface CloudflareTunnelModalProps {
  apiFetch: ApiFetch;
  onClose: () => void;
  onComplete?: () => void;
}

const WIZARD_STEPS = [
  { id: 'token', label: 'API Token' },
  { id: 'zone', label: 'Domain' },
  { id: 'tunnel', label: 'Tunnel' },
];

export function CloudflareTunnelModal({ apiFetch, onClose, onComplete }: CloudflareTunnelModalProps) {
  const setup = useCloudflareSetup(apiFetch);
  const { setPassword } = useAuth();
  const [helpKey, setHelpKey] = useState<string | null>(null);

  const {
    currentStep,
    completedSteps,
    loading,
    summary,
    tokenValidating,
    tokenError,
    tokenEmail,
    adminPasswordRequired,
    saveTokenAction,
    submitAdminPassword,
    zones,
    zonesLoading,
    zonesError,
    loadZones,
    selectZoneAction,
    defaultTunnelName,
    tunnelCreating,
    tunnelError,
    tunnelComposeUpdated,
    tunnelContainerRestarted,
    createTunnelAction,
    resetSetup,
  } = setup;

  const handleAdminPassword = async (pw: string) => {
    setPassword(pw); // update auth context for all subsequent apiFetch calls
    await submitAdminPassword(pw);
  };

  return (
    <>
      <div className="overlay">
        <div
          className="modal"
          style={{ maxWidth: 540, width: '100%' }}
          onClick={(e) => e.stopPropagation()}
        >
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
                Cloudflare Domain Setup
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
                Connect your apps to a public domain via Cloudflare Tunnel
              </div>
            </div>
            <button className="xbtn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--txt2)', padding: '30px 0' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
                Loading settings…
              </div>
            ) : (
              <>
                {/* One-time setup banner */}
                {currentStep !== 'complete' && (
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
                    One-time setup — complete these steps once to connect all your apps to a public domain.
                    <span style={{ marginLeft: 6, color: 'var(--txt3)', fontSize: 11 }}>
                      각 항목의 <strong style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>?</strong> 버튼을 누르면 도움말이 표시됩니다.
                    </span>
                  </div>
                )}

                {/* Step indicator */}
                <StepIndicator
                  steps={WIZARD_STEPS}
                  currentStep={currentStep}
                  completedSteps={completedSteps}
                />

                {/* Step content */}
                {currentStep === 'token' && (
                  <TokenStep
                    tokenValidating={tokenValidating}
                    tokenError={tokenError}
                    tokenEmail={tokenEmail}
                    adminPasswordRequired={adminPasswordRequired}
                    onSaveToken={saveTokenAction}
                    onAdminPassword={handleAdminPassword}
                    onHelp={setHelpKey}
                  />
                )}

                {currentStep === 'zone' && (
                  <ZoneStep
                    zones={zones}
                    zonesLoading={zonesLoading}
                    zonesError={zonesError}
                    onLoadZones={loadZones}
                    onSelectZone={selectZoneAction}
                    onHelp={setHelpKey}
                  />
                )}

                {currentStep === 'tunnel' && (
                  <TunnelStep
                    defaultTunnelName={defaultTunnelName}
                    tunnelCreating={tunnelCreating}
                    tunnelError={tunnelError}
                    isComplete={false}
                    onCreateTunnel={createTunnelAction}
                    onStartOver={resetSetup}
                    onHelp={setHelpKey}
                  />
                )}

                {currentStep === 'complete' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Success summary card */}
                    <div style={{
                      padding: '16px 20px',
                      borderRadius: 'var(--r)',
                      background: 'rgba(61,214,200,0.06)',
                      border: '1px solid rgba(61,214,200,0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16, color: 'var(--teal)', fontWeight: 700 }}>✓</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)' }}>
                          Cloudflare Tunnel Active
                        </span>
                      </div>
                      {summary?.tunnelName && (
                        <div style={{ fontSize: 13, color: 'var(--txt2)' }}>
                          Tunnel: <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{summary.tunnelName}</span>
                        </div>
                      )}
                      {summary?.zoneName && (
                        <div style={{ fontSize: 13, color: 'var(--txt2)' }}>
                          Domain: <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{summary.zoneName}</span>
                        </div>
                      )}
                    </div>

                    {/* cloudflared restart status — only shown when tunnel was just created */}
                    {tunnelContainerRestarted === true && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 'var(--r)',
                        background: 'rgba(61,214,200,0.06)', border: '1px solid rgba(61,214,200,0.2)',
                        fontSize: 12, color: 'var(--teal)',
                      }}>
                        <span style={{ fontWeight: 700 }}>✓</span>
                        cloudflared 컨테이너가 자동으로 재시작됐습니다
                      </div>
                    )}

                    {tunnelComposeUpdated === true && tunnelContainerRestarted === false && (
                      <div style={{
                        padding: '8px 12px', borderRadius: 'var(--r)',
                        background: 'rgba(232,168,73,0.07)', border: '1px solid rgba(232,168,73,0.25)',
                        fontSize: 12, color: 'var(--amber)', lineHeight: 1.6,
                      }}>
                        ⚠ docker-compose.yml은 업데이트됐지만 cloudflared 재시작에 실패했습니다.<br />
                        수동으로{' '}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                          docker compose up -d --force-recreate cloudflared
                        </span>
                        을 실행하세요.
                      </div>
                    )}

                    {tunnelComposeUpdated === false && (
                      <div style={{
                        padding: '8px 12px', borderRadius: 'var(--r)',
                        background: 'rgba(232,168,73,0.07)', border: '1px solid rgba(232,168,73,0.25)',
                        fontSize: 12, color: 'var(--amber)', lineHeight: 1.6,
                      }}>
                        ⚠ docker-compose.yml을 자동으로 업데이트하지 못했습니다.<br />
                        cloudflared 서비스의{' '}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>command</span>와{' '}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>TUNNEL_TOKEN</span>을
                        수동으로 업데이트하고 재시작하세요.
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: 'var(--txt3)' }}>
                      You can now connect your apps to subdomains from each app's Domain tab.
                    </div>

                    <button className="btn bp" onClick={onComplete ?? onClose} style={{ alignSelf: 'flex-end' }}>
                      Connect apps →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Help drawer — slides in from the right, independent of the modal layer */}
      <HelpDrawer helpKey={helpKey} onClose={() => setHelpKey(null)} />
    </>
  );
}
