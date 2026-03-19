// T036 — OverviewTab: app metadata, URLs, git info, boilerplate stack details
import type { AppEntry, AppGitInfo, BoilerplateMeta } from '../types.js';
import { BOILERPLATE_GITHUB_BASE } from '../lib/constants.js';

interface OverviewTabProps {
  app: AppEntry;
  git: AppGitInfo | null;
  boilerplate?: BoilerplateMeta | null;
}

function StatusBadge({ status }: { status: AppEntry['status'] }) {
  const cls =
    status === 'running' ? 'bdg b-run'
    : status === 'stopped' ? 'bdg b-stop'
    : status === 'creating' ? 'bdg b-build'
    : 'bdg b-stop';
  return <span className={cls}>{status}</span>;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid var(--bdr)',
    }}>
      <span style={{
        width: 140,
        flexShrink: 0,
        fontSize: 12,
        color: 'var(--txt3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        paddingTop: 1,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: 'var(--txt)', wordBreak: 'break-all' }}>
        {children}
      </span>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function OverviewTab({ app, git, boilerplate }: OverviewTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* App Info Card */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="section-title" style={{ marginBottom: 12 }}>App Info</div>
        <div>
          <InfoRow label="Name">
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{app.name}</span>
          </InfoRow>
          <InfoRow label="Status">
            <StatusBadge status={app.status} />
          </InfoRow>
          <InfoRow label="Port">
            <span style={{ fontFamily: 'var(--mono)' }}>{app.port}</span>
          </InfoRow>
          {app.lang && (
            <InfoRow label="Language">
              {app.lang}{app.framework ? ` / ${app.framework}` : ''}
            </InfoRow>
          )}
          <InfoRow label="App Directory">
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt2)', fontSize: 12 }}>
              {app.appDir}
            </span>
          </InfoRow>
          <InfoRow label="Created">
            {formatDate(app.createdAt)}
          </InfoRow>
          <InfoRow label="Last Deployed">
            {app.lastDeployedAt ? formatDate(app.lastDeployedAt) : (
              <span style={{ color: 'var(--txt3)', fontStyle: 'italic' }}>Never deployed</span>
            )}
          </InfoRow>
        </div>
      </div>

      {/* Access URLs */}
      {(app.localUrl || app.externalUrl || boilerplate?.backendUrl || boilerplate?.frontendUrl) && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Access</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {app.localUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 80, fontSize: 12, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Local</span>
                <a href={app.localUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--teal)', fontSize: 13, fontFamily: 'var(--mono)', textDecoration: 'none' }}>
                  {app.localUrl} <span style={{ fontSize: 11, color: 'var(--txt3)' }}>↗</span>
                </a>
              </div>
            )}
            {app.externalUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 80, fontSize: 12, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>External</span>
                <a href={app.externalUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--amber)', fontSize: 13, fontFamily: 'var(--mono)', textDecoration: 'none' }}>
                  {app.externalUrl} <span style={{ fontSize: 11, color: 'var(--txt3)' }}>↗</span>
                </a>
              </div>
            )}
            {boilerplate?.backendUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 80, fontSize: 12, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {boilerplate.isUnified ? 'App' : 'Backend'}
                </span>
                <a href={boilerplate.backendUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--teal)', fontSize: 13, fontFamily: 'var(--mono)', textDecoration: 'none' }}>
                  {boilerplate.backendUrl} <span style={{ fontSize: 11, color: 'var(--txt3)' }}>↗</span>
                </a>
              </div>
            )}
            {boilerplate?.frontendUrl && !boilerplate.isUnified && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 80, fontSize: 12, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Frontend</span>
                <a href={boilerplate.frontendUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--amber)', fontSize: 13, fontFamily: 'var(--mono)', textDecoration: 'none' }}>
                  {boilerplate.frontendUrl} <span style={{ fontSize: 11, color: 'var(--txt3)' }}>↗</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stack Details (boilerplate only) */}
      {boilerplate && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Stack Details</div>
            <a
              href={`${BOILERPLATE_GITHUB_BASE}/${boilerplate.stackId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn bg bsm"
              style={{ fontSize: 11 }}
            >
              GitHub ↗
            </a>
          </div>

          {/* DB Credentials */}
          {(boilerplate.dbDriver || boilerplate.dbUser || boilerplate.dbName) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Database
              </div>
              <div style={{
                background: 'var(--bg3)',
                border: '1px solid var(--bdr)',
                borderRadius: 'var(--r)',
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                {boilerplate.dbDriver && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', width: 60 }}>Driver</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{boilerplate.dbDriver}</span>
                  </div>
                )}
                {boilerplate.dbUser && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', width: 60 }}>User</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{boilerplate.dbUser}</span>
                  </div>
                )}
                {boilerplate.dbName && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', width: 60 }}>Name</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{boilerplate.dbName}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* API Endpoints */}
          {boilerplate.backendUrl && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                API Endpoints
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Health', path: '/health' },
                  { label: 'Hello',  path: '/hello' },
                  { label: 'Echo',   path: '/echo' },
                  { label: 'Docs',   path: '/docs' },
                ].map(({ label, path }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--txt3)', width: 46, textTransform: 'uppercase' }}>
                      {label}
                    </span>
                    <a
                      href={`${boilerplate.backendUrl}${path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="domain-link"
                      style={{ fontSize: 11 }}
                    >
                      {boilerplate.backendUrl}{path}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Git Info */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Git Repository</div>
        {!app.lastDeployedAt && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(232,168,73,0.07)',
            border: '1px solid rgba(232,168,73,0.2)',
            borderRadius: 'var(--r)',
            padding: '10px 14px',
            marginBottom: 14,
            fontSize: 12.5,
            color: 'var(--amber)',
          }}>
            <span>⚠</span>
            <span>Deploy를 먼저 실행하면 Gitea 저장소가 초기화되고 접속 주소가 활성화됩니다.</span>
          </div>
        )}
        {git ? (
          <div>
            <InfoRow label="Branch">
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                {git.branch}
              </span>
            </InfoRow>
            {git.giteaUrl && (
              <InfoRow label="Gitea URL">
                <a
                  href={git.giteaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: app.lastDeployedAt ? 'var(--teal)' : 'var(--txt3)',
                    fontSize: 13,
                    fontFamily: 'var(--mono)',
                    textDecoration: 'none',
                    opacity: app.lastDeployedAt ? 1 : 0.5,
                  }}
                >
                  {git.giteaUrl}
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--txt3)' }}>↗</span>
                </a>
              </InfoRow>
            )}
            {git.latestCommit ? (
              <>
                <InfoRow label="Latest Commit">
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', fontSize: 12 }}>
                    {git.latestCommit.shortHash}
                  </span>
                  <span style={{ marginLeft: 10, color: 'var(--txt2)', fontSize: 13 }}>
                    {git.latestCommit.message}
                  </span>
                </InfoRow>
                <InfoRow label="Commit Date">
                  {formatDate(git.latestCommit.date)}
                </InfoRow>
              </>
            ) : (
              <InfoRow label="Latest Commit">
                <span style={{ color: 'var(--txt3)', fontStyle: 'italic' }}>No commits yet</span>
              </InfoRow>
            )}
            <InfoRow label="Clone (HTTP)">
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--txt2)' }}>
                {git.cloneUrlHttp}
              </span>
            </InfoRow>
          </div>
        ) : (
          <div style={{ color: 'var(--txt3)', fontSize: 13, fontStyle: 'italic' }}>
            Git information unavailable
          </div>
        )}
      </div>
    </div>
  );
}
