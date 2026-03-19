import type { BoilerplateMeta } from '../types.js';

interface BoilerplateDetailModalProps {
  stack: BoilerplateMeta;
  onClose: () => void;
}

const GITHUB_BASE = 'https://github.com/codevillain-dev/brewnet-boilerplates/tree/main';

export function BoilerplateDetailModal({ stack, onClose }: BoilerplateDetailModalProps) {
  const githubUrl = `${GITHUB_BASE}/${stack.stackId}`;

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
            {stack.stackId}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn bg bsm"
            >
              Open GitHub ↗
            </a>
            <button className="xbtn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Lang / Framework chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stack.lang && (
              <span
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
                {stack.lang}
              </span>
            )}
            {stack.frameworkId && (
              <span
                style={{
                  fontSize: 11.5,
                  fontFamily: 'var(--mono)',
                  color: 'var(--violet)',
                  background: 'rgba(167,139,250,0.07)',
                  border: '1px solid rgba(167,139,250,0.18)',
                  borderRadius: 4,
                  padding: '3px 9px',
                }}
              >
                {stack.frameworkId}
              </span>
            )}
            {stack.status && (
              <span
                className={stack.status === 'running' ? 'bdg b-run' : stack.status === 'stopped' ? 'bdg b-stop' : 'bdg b-build'}
              >
                {stack.status === 'running' && <span className="blink-dot" />}
                {stack.status}
              </span>
            )}
            {stack.isUnified && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--mono)',
                  color: 'var(--amber)',
                  background: 'rgba(232,168,73,0.07)',
                  border: '1px solid rgba(232,168,73,0.18)',
                  borderRadius: 4,
                  padding: '2px 8px',
                }}
              >
                Unified
              </span>
            )}
          </div>

          {/* Git branch */}
          {stack.gitBranch && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Git Branch</div>
              <div className="cb" style={{ marginTop: 0, padding: '8px 12px' }}>
                {stack.gitBranch}
              </div>
            </div>
          )}

          {/* DB Credentials */}
          {(stack.dbDriver || stack.dbUser || stack.dbName) && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Database</div>
              <div
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--bdr)',
                  borderRadius: 'var(--r)',
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {stack.dbDriver && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', width: 60 }}>Driver</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{stack.dbDriver}</span>
                  </div>
                )}
                {stack.dbUser && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', width: 60 }}>User</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{stack.dbUser}</span>
                  </div>
                )}
                {stack.dbName && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', width: 60 }}>Name</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{stack.dbName}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* API Endpoints */}
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>API Endpoints</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stack.backendUrl && (
                <>
                  {[
                    { label: 'Health', path: '/health' },
                    { label: 'Hello', path: '/hello' },
                    { label: 'Echo', path: '/echo' },
                    { label: 'Docs', path: '/docs' },
                  ].map(({ label, path }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--mono)',
                          color: 'var(--txt3)',
                          width: 46,
                          textTransform: 'uppercase',
                        }}
                      >
                        {label}
                      </span>
                      <a
                        href={`${stack.backendUrl}${path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="domain-link"
                        style={{ fontSize: 11 }}
                      >
                        {stack.backendUrl}{path}
                      </a>
                    </div>
                  ))}
                </>
              )}
              {stack.frontendUrl && !stack.isUnified && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--mono)',
                      color: 'var(--txt3)',
                      width: 46,
                      textTransform: 'uppercase',
                    }}
                  >
                    UI
                  </span>
                  <a
                    href={stack.frontendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="domain-link"
                    style={{
                      fontSize: 11,
                      background: 'rgba(232,168,73,0.07)',
                      borderColor: 'rgba(232,168,73,0.18)',
                      color: 'var(--amber)',
                    }}
                  >
                    {stack.frontendUrl}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* App Directory */}
          {stack.appDir && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Stack Directory</div>
              <div className="cb" style={{ marginTop: 0, padding: '8px 12px', fontSize: 11 }}>
                {stack.appDir}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
