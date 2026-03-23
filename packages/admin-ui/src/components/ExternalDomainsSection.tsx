import { useState } from 'react';
import type { DomainConnection } from '../types.js';

interface ExternalDomainsSectionProps {
  connections: DomainConnection[];
  tunnelId: string;
  zoneName: string;
}

const DNS_PROVIDERS = [
  {
    name: 'GoDaddy',
    steps: [
      'Log in to your GoDaddy account → DNS Management',
      'Find the CNAME record for your subdomain',
      `Set the "Value" to: <tunnel-id>.cfargotunnel.com`,
      'TTL: 1 hour (or Auto)',
      'Save and wait for propagation (up to 30 min)',
    ],
  },
  {
    name: 'Namecheap',
    steps: [
      'Log in → Domain List → Manage → Advanced DNS',
      'Add / Edit CNAME record',
      `Host: your subdomain (e.g. "app")`,
      `Value: <tunnel-id>.cfargotunnel.com`,
      'TTL: Automatic → Save All Changes',
    ],
  },
  {
    name: '가비아 (Gabia)',
    steps: [
      '가비아 로그인 → My 가비아 → DNS 관리',
      '해당 도메인 DNS 설정 클릭',
      '레코드 타입: CNAME 선택',
      `호스트명: 서브도메인 (예: app)`,
      `값/주소: <tunnel-id>.cfargotunnel.com`,
      'TTL: 3600 → 확인/저장',
    ],
  },
  {
    name: 'Cafe24',
    steps: [
      '카페24 호스팅센터 로그인 → 나의서비스관리 → 도메인 관리',
      '도메인 목록에서 DNS 관리 클릭',
      'CNAME 레코드 추가',
      `이름(서브도메인): 원하는 호스트명`,
      `대상: <tunnel-id>.cfargotunnel.com`,
      '저장 후 전파 대기 (최대 1~2시간)',
    ],
  },
];

export function ExternalDomainsSection({ connections, tunnelId, zoneName }: ExternalDomainsSectionProps) {
  const [showCnameModal, setShowCnameModal] = useState(false);
  const [activeProvider, setActiveProvider] = useState(0);

  const cnameTarget = tunnelId ? `${tunnelId}.cfargotunnel.com` : '<tunnel-id>.cfargotunnel.com';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>External Domain Connections</div>
        <button className="btn bg bsm" onClick={() => setShowCnameModal(true)}>
          CNAME Guide
        </button>
      </div>

      {zoneName && (
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt3)', marginBottom: 10 }}>
          Zone: <span style={{ color: 'var(--txt2)' }}>{zoneName}</span>
        </div>
      )}

      {connections.length === 0 ? (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px dashed var(--bdr2)',
            borderRadius: 'var(--r2)',
            padding: '28px 20px',
            textAlign: 'center',
            color: 'var(--txt2)',
            fontFamily: 'var(--mono)',
            fontSize: 13,
          }}
        >
          No external domain connections
        </div>
      ) : (
        <div className="rtbl-wrap">
          <table className="rtbl">
            <thead>
              <tr>
                <th>App Name</th>
                <th>URL</th>
                <th>Status</th>
                <th>Connected At</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((conn) => (
                <tr key={conn.appName}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                    {conn.appName}
                  </td>
                  <td>
                    <a
                      href={`https://${conn.hostname}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="domain-link"
                    >
                      ↗ {conn.hostname}
                    </a>
                  </td>
                  <td>
                    <span className="bdg b-run">
                      <span className="blink-dot" />
                      Active
                    </span>
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>
                    {conn.connectedAt
                      ? new Date(conn.connectedAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>
                    <a
                      href={`https://dash.cloudflare.com/?to=/:account/tunnels`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn bg bxs"
                    >
                      CF Dashboard ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CNAME Guide Modal */}
      {showCnameModal && (
        <div className="overlay" onClick={() => setShowCnameModal(false)}>
          <div
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--bdr)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--mono)' }}>
                DNS CNAME Setup Guide
              </span>
              <button className="xbtn" onClick={() => setShowCnameModal(false)} aria-label="Close">✕</button>
            </div>

            <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Target CNAME */}
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}>CNAME Target</div>
                <div className="cb" style={{ marginTop: 0 }}>
                  {cnameTarget}
                </div>
              </div>

              {/* Provider tabs */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DNS_PROVIDERS.map((p, i) => (
                  <button
                    key={p.name}
                    className={`btn bsm ${activeProvider === i ? 'bp' : 'bg'}`}
                    onClick={() => setActiveProvider(i)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              {/* Steps */}
              <div
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--bdr)',
                  borderRadius: 'var(--r)',
                  padding: '14px 16px',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 10 }}>
                  {DNS_PROVIDERS[activeProvider].name}
                </div>
                <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {DNS_PROVIDERS[activeProvider].steps.map((step, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12,
                        color: 'var(--txt2)',
                        lineHeight: 1.6,
                        fontFamily: step.includes('<tunnel') ? 'var(--mono)' : 'var(--sans)',
                      }}
                    >
                      {step.replace('<tunnel-id>', tunnelId || '<tunnel-id>')}
                    </li>
                  ))}
                </ol>
              </div>

              <p style={{ fontSize: 11.5, color: 'var(--txt3)', lineHeight: 1.6 }}>
                After adding the CNAME, DNS propagation may take 5–30 minutes. You can verify using{' '}
                <code style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                  dig CNAME your-subdomain.example.com
                </code>
                .
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
