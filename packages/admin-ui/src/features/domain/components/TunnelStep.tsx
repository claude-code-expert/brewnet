// features/domain/components/TunnelStep.tsx — Step 3: Tunnel creation

import { useState } from 'react';
import { Zap, Loader } from 'lucide-react';
import { HelpTooltip } from './HelpTooltip.js';
import { useI18n } from '../../../i18n/useI18n.js';

interface TunnelStepProps {
  defaultTunnelName: string;
  tunnelCreating: boolean;
  tunnelError: string | null;
  isComplete: boolean;
  composeUpdated?: boolean;
  containerRestarted?: boolean;
  onCreateTunnel: (tunnelName: string) => Promise<void>;
  onStartOver: () => void;
  onHelp: (key: string) => void;
}

export function TunnelStep({
  defaultTunnelName,
  tunnelCreating,
  tunnelError,
  isComplete,
  composeUpdated,
  containerRestarted,
  onCreateTunnel,
  onStartOver,
  onHelp,
}: TunnelStepProps) {
  const { t } = useI18n();
  const [tunnelName, setTunnelName] = useState(defaultTunnelName);

  if (isComplete) {
    // Determine cloudflared restart status (only relevant when fields are defined,
    // i.e., tunnel was just created in this session vs. pre-existing from state load)
    const showRestartStatus = composeUpdated !== undefined || containerRestarted !== undefined;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--teal)' }}>
          <span style={{ fontWeight: 700 }}>✓</span>
          Tunnel <strong style={{ fontFamily: 'var(--mono)' }}>{defaultTunnelName}</strong> created!
        </div>

        {showRestartStatus && containerRestarted && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 'var(--r)',
            background: 'rgba(61,214,200,0.06)', border: '1px solid rgba(61,214,200,0.2)',
            fontSize: 12, color: 'var(--teal)',
          }}>
            <span style={{ fontWeight: 700 }}>✓</span>
            {t('tunnel.compose_restart_done', 'docker-compose.yml 업데이트 및 cloudflared 컨테이너 재시작 완료')}
          </div>
        )}

        {showRestartStatus && composeUpdated && !containerRestarted && (
          <div style={{
            padding: '8px 12px', borderRadius: 'var(--r)',
            background: 'rgba(232,168,73,0.07)', border: '1px solid rgba(232,168,73,0.25)',
            fontSize: 12, color: 'var(--amber)', lineHeight: 1.6,
          }}>
            ⚠ {t('tunnel.compose_restart_failed', 'docker-compose.yml은 업데이트됐지만 cloudflared 재시작에 실패했습니다.')}<br />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
              docker compose up -d --force-recreate cloudflared
            </span>
            {t('tunnel.manual_run_suffix', '을 수동으로 실행하세요.')}
          </div>
        )}

        {showRestartStatus && !composeUpdated && (
          <div style={{
            padding: '8px 12px', borderRadius: 'var(--r)',
            background: 'rgba(232,168,73,0.07)', border: '1px solid rgba(232,168,73,0.25)',
            fontSize: 12, color: 'var(--amber)', lineHeight: 1.6,
          }}>
            ⚠ {t('tunnel.compose_update_failed', 'docker-compose.yml을 자동으로 업데이트하지 못했습니다.')}<br />
            {t('tunnel.manual_update', 'cloudflared 서비스의 {command}와 {token} 환경변수를 수동으로 업데이트하고 재시작하세요.', { command: 'command', token: 'TUNNEL_TOKEN' })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>
          Tunnel Name
          <span style={{ marginLeft: 6 }}>
            <HelpTooltip helpKey="tunnel-name" onHelp={onHelp} />
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>
          {t('tunnel.name_desc', 'Cloudflare에 생성할 터널의 이름입니다. 이 터널은 모든 앱이 공유하는 공통 연결 채널입니다.')}
        </div>

        <input
          className="fi"
          value={tunnelName}
          onChange={(e) => setTunnelName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !tunnelCreating && tunnelName.trim()) {
              void onCreateTunnel(tunnelName.trim());
            }
          }}
          placeholder="brewnet-homeserver"
          disabled={tunnelCreating}
          style={{ borderColor: tunnelError ? 'var(--red)' : undefined, fontFamily: 'var(--mono)' }}
        />

        {tunnelError && tunnelError.includes('Steps 1 and 2') ? (
          <div style={{
            marginTop: 12,
            padding: '12px 14px',
            borderRadius: 'var(--r)',
            background: 'rgba(232,168,73,0.07)',
            border: '1px solid rgba(232,168,73,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>
              ⚠ {t('tunnel.step12_invalid_title', 'Step 1·2 정보가 올바르지 않습니다')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>
              {t('tunnel.step12_invalid_desc', 'API 토큰 또는 Zone 정보가 저장되지 않았습니다. Step 1부터 다시 진행해 주세요.')}
            </div>
            <button
              className="btn bp"
              onClick={onStartOver}
              style={{ alignSelf: 'flex-end' }}
            >
              ← {t('tunnel.step12_restart', 'Step 1부터 다시 시작')}
            </button>
          </div>
        ) : tunnelError ? (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
            {tunnelError}
          </div>
        ) : null}
      </div>

      <button
        className="btn bp"
        onClick={() => void onCreateTunnel(tunnelName.trim())}
        disabled={tunnelCreating || !tunnelName.trim()}
        style={{ alignSelf: 'flex-end', opacity: tunnelCreating || !tunnelName.trim() ? 0.6 : 1 }}
      >
        {tunnelCreating
          ? <><Loader size={14} className="spin" /> Creating tunnel…</>
          : <><Zap size={14} /> Create Tunnel</>}
      </button>
    </div>
  );
}
