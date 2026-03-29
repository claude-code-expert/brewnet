// features/domain/components/TokenStep.tsx — Step 1: API Token input with validation

import { useState } from 'react';
import { ShieldCheck, Loader, KeyRound } from 'lucide-react';
import { HelpTooltip } from './HelpTooltip.js';
import { useI18n } from '../../../i18n/useI18n.js';

interface TokenStepProps {
  tokenValidating: boolean;
  tokenError: string | null;
  tokenEmail: string | null;
  adminPasswordRequired?: boolean;
  onSaveToken: (token: string) => Promise<void>;
  onAdminPassword?: (pw: string) => Promise<void>;
  onHelp: (key: string) => void;
}

export function TokenStep({ tokenValidating, tokenError, tokenEmail, adminPasswordRequired, onSaveToken, onAdminPassword, onHelp }: TokenStepProps) {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const handleSubmit = () => {
    if (token.trim()) {
      void onSaveToken(token.trim());
    }
  };
  const handleAdminPwSubmit = () => {
    if (adminPw.trim() && onAdminPassword) {
      void onAdminPassword(adminPw.trim());
      setAdminPw('');
    }
  };

  const isVerified = !!tokenEmail;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>
          Cloudflare API Token
          <span style={{ marginLeft: 6 }}>
            <HelpTooltip helpKey="api-token" onHelp={onHelp} />
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>
          Required permissions: <strong>Cloudflare Tunnel:Edit</strong>, <strong>DNS:Edit</strong>, <strong>Zone:Read</strong>
        </div>

        <input
          className="fi"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          onBlur={handleSubmit}
          placeholder="Paste your API token here…"
          autoComplete="new-password"
          disabled={tokenValidating}
          style={{
            borderColor: tokenError ? 'var(--red)' : isVerified ? 'var(--teal)' : undefined,
          }}
        />

        {/* Validating spinner */}
        {tokenValidating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--txt2)' }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
            Verifying token…
          </div>
        )}

        {/* Error */}
        {tokenError && !tokenValidating && !adminPasswordRequired && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
            {tokenError}
          </div>
        )}

        {/* Admin password prompt — shown when the server requires authentication */}
        {adminPasswordRequired && !tokenValidating && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>
              <KeyRound size={13} />
              Admin password required
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.5 }}>
              {t('token.admin_pw_desc', '브루넷 설치 시 설정한 관리자 비밀번호를 입력하세요.')}
            </div>
            <input
              className="fi"
              type="password"
              value={adminPw}
              onChange={(e) => setAdminPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdminPwSubmit(); }}
              placeholder="Admin password"
              autoFocus
              autoComplete="current-password"
            />
            <button
              className="btn bp"
              onClick={handleAdminPwSubmit}
              disabled={!adminPw.trim()}
              style={{ alignSelf: 'flex-start', opacity: !adminPw.trim() ? 0.6 : 1 }}
            >
              <ShieldCheck size={14} /> Confirm &amp; Verify
            </button>
          </div>
        )}

        {/* Success */}
        {isVerified && !tokenValidating && !tokenError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--teal)' }}>
            <span style={{ fontWeight: 700 }}>✓</span>
            Verified — {tokenEmail}
          </div>
        )}
      </div>

      <button
        className="btn bp"
        onClick={handleSubmit}
        disabled={tokenValidating || !token.trim()}
        style={{ alignSelf: 'flex-start', opacity: tokenValidating || !token.trim() ? 0.6 : 1 }}
      >
        {tokenValidating
          ? <><Loader size={14} className="spin" /> Verifying…</>
          : <><ShieldCheck size={14} /> Verify Token</>}
      </button>
    </div>
  );
}
