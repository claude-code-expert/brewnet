import type { ServiceStatus, ServiceDetail } from '../types.js';

interface ServiceDetailModalProps {
  service: ServiceStatus;
  detail: ServiceDetail | undefined;
  onClose: () => void;
}

export function ServiceDetailModal({ service, detail, onClose }: ServiceDetailModalProps) {
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
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
        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--mono)' }}>
              {service.name}
            </span>
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

          {/* URLs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {service.url && (
              <a href={service.url} target="_blank" rel="noopener noreferrer" className="btn bg bsm">
                ↗ Local URL
              </a>
            )}
            {service.externalUrl && (
              <a href={service.externalUrl} target="_blank" rel="noopener noreferrer" className="btn bt bsm">
                ↗ External URL
              </a>
            )}
            {detail?.docs && (
              <a href={detail.docs} target="_blank" rel="noopener noreferrer" className="btn bv bsm">
                📖 Docs
              </a>
            )}
          </div>

          {/* Port / uptime info */}
          {(service.port || service.uptime) && (
            <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--bdr)', paddingTop: 12 }}>
              {service.port && (
                <div>
                  <div className="sk" style={{ marginBottom: 4 }}>Port</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--txt)' }}>:{service.port}</div>
                </div>
              )}
              {service.uptime && (
                <div>
                  <div className="sk" style={{ marginBottom: 4 }}>Uptime</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--txt)' }}>{service.uptime}</div>
                </div>
              )}
              {service.cpu && (
                <div>
                  <div className="sk" style={{ marginBottom: 4 }}>CPU</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--txt)' }}>{service.cpu}</div>
                </div>
              )}
              {service.memory && (
                <div>
                  <div className="sk" style={{ marginBottom: 4 }}>Memory</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--txt)' }}>{service.memory}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
