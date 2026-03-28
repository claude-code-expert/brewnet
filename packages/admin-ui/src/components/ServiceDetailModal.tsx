import type { ServiceStatus, ServiceDetail } from '../types.js';

interface ServiceDetailModalProps {
  service: ServiceStatus;
  detail: ServiceDetail | undefined;
  onClose: () => void;
}

export function ServiceDetailModal({ service, detail, onClose }: ServiceDetailModalProps) {
  return (
    <div className="overlay">
      <div
        className="modal"
        style={{ maxWidth: 720 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* macOS-style titlebar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 18px 12px',
            borderBottom: '1px solid var(--bdr)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: '#ff5f57', display: 'inline-block',
            }}
          />
          <span
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: '#febc2e', display: 'inline-block',
            }}
          />
          <span
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: '#28c840', display: 'inline-block',
            }}
          />
          <span
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              color: 'var(--txt2)',
              marginLeft: -44,
            }}
          >
            {detail?.name ?? service.name}
          </span>
          <button className="xbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name + status + port/uptime */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                {service.name}
              </span>
              {service.port && (
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>:{service.port}</span>
              )}
              {service.uptime && service.uptime !== '—' && (
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {service.uptime}
                </span>
              )}
            </div>
            <span
              className={
                service.status === 'running' ? 'bdg b-run'
                  : service.status === 'stopped' ? 'bdg b-stop'
                  : service.status === 'error' ? 'bdg b-stop'
                  : 'bdg b-idle'
              }
            >
              {service.status === 'running' && <span className="blink-dot" />}
              {service.status}
            </span>
          </div>

          {/* Description */}
          {detail?.description && (
            <p style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6, margin: 0 }}>
              {detail.description}
            </p>
          )}

          {/* License */}
          {detail?.license && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>LICENSE</span>
              <span
                style={{
                  fontSize: 11.5,
                  fontFamily: 'var(--mono)',
                  color: 'var(--amber)',
                  background: 'rgba(232,168,73,0.08)',
                  border: '1px solid rgba(232,168,73,0.18)',
                  borderRadius: 4,
                  padding: '2px 8px',
                }}
              >
                {detail.license}
              </span>
            </div>
          )}

          {/* Features */}
          {detail?.features && detail.features.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 8 }}>Features</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {detail.features.map((f) => (
                  <span
                    key={f}
                    style={{
                      fontSize: 11.5,
                      fontFamily: 'var(--mono)',
                      color: 'var(--teal)',
                      background: 'rgba(61,214,200,0.07)',
                      border: '1px solid rgba(61,214,200,0.18)',
                      borderRadius: 4,
                      padding: '3px 9px',
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Credentials */}
          {detail?.credentials && (
            <div>
              <div className="section-title" style={{ marginBottom: 8 }}>Credentials</div>
              <div className="cb" style={{ marginTop: 0 }}>
                {detail.credentials.summary}
                {detail.credentials.keys && detail.credentials.keys.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {detail.credentials.keys.map((k) => (
                      <span key={k} style={{ color: 'var(--amber2)' }}>{k}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Connection Params */}
          {detail?.connectionParams && detail.connectionParams.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 8 }}>Connection</div>
              <div
                style={{
                  background: '#0a1020',
                  border: '1px solid var(--bdr)',
                  borderRadius: 'var(--r)',
                  padding: '10px 14px',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  columnGap: 16,
                  rowGap: 5,
                }}
              >
                {detail.connectionParams.map(({ label, value }) => (
                  <>
                    <span key={`${label}-k`} style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>
                      {label}
                    </span>
                    <span key={`${label}-v`} style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                      {value}
                    </span>
                  </>
                ))}
              </div>
            </div>
          )}

          {/* How to Connect */}
          {detail?.credentials?.command && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>How to Connect</div>
                <span style={{
                  fontSize: 10,
                  fontFamily: 'var(--mono)',
                  color: 'var(--txt3)',
                  background: 'var(--bg3)',
                  border: '1px solid var(--bdr)',
                  borderRadius: 20,
                  padding: '1px 7px',
                }}>
                  Terminal only
                </span>
              </div>
              <div
                style={{
                  background: '#0a1020',
                  border: '1px solid var(--bdr)',
                  borderRadius: 'var(--r)',
                  padding: '10px 14px',
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--teal)',
                  overflowX: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                {detail.credentials.command}
              </div>
            </div>
          )}

          {/* Tips */}
          {detail?.tips && detail.tips.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 8 }}>Tips</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.tips.map((tip) => (
                  <div
                    key={tip}
                    style={{
                      display: 'flex',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--txt2)',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: 'var(--txt3)', flexShrink: 0 }}>›</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* URLs */}
          {(service.url || service.externalUrl || service.backendApiUrl) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {service.url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--txt3)', width: 70, flexShrink: 0 }}>LOCAL</span>
                  <a
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--mono)',
                      color: 'var(--teal)',
                      background: 'rgba(61,214,200,0.07)',
                      border: '1px solid rgba(61,214,200,0.18)',
                      borderRadius: 4,
                      padding: '3px 10px',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                    title={service.url}
                  >
                    ↗ {service.url}
                  </a>
                </div>
              )}
              {service.backendApiUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--txt3)', width: 70, flexShrink: 0 }}>BACKEND</span>
                  <a
                    href={service.backendApiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--mono)',
                      color: 'var(--teal)',
                      background: 'rgba(61,214,200,0.07)',
                      border: '1px solid rgba(61,214,200,0.18)',
                      borderRadius: 4,
                      padding: '3px 10px',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                    title={service.backendApiUrl}
                  >
                    ↗ {service.backendApiUrl}
                  </a>
                </div>
              )}
              {service.externalUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--txt3)', width: 70, flexShrink: 0 }}>EXTERNAL</span>
                  <a
                    href={service.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--mono)',
                      color: 'var(--amber)',
                      background: 'rgba(232,168,73,0.07)',
                      border: '1px solid rgba(232,168,73,0.18)',
                      borderRadius: 4,
                      padding: '3px 10px',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                    title={service.externalUrl}
                  >
                    ↗ {service.externalUrl}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Docs */}
          {detail?.docs && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <a href={detail.docs} target="_blank" rel="noopener noreferrer" className="btn bv bsm">
                📖 Docs
              </a>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
