// T029 — AppCard component
import type { AppEntry } from '../types.js';
import { showToast } from './Toast.js';

interface AppCardProps {
  app: AppEntry;
  onOpenDetail: () => void;
  onStart: () => void;
  onStop: () => void;
  onDeploy: () => void;
  onDelete: () => void;
}

function statusBadgeClass(status: AppEntry['status']): string {
  switch (status) {
    case 'running':  return 'bdg b-run';
    case 'stopped':  return 'bdg b-stop';
    case 'creating': return 'bdg b-build';
    case 'failed':   return 'bdg b-stop';
    default:         return 'bdg b-idle';
  }
}

function statusDot(status: AppEntry['status']) {
  if (status === 'running' || status === 'creating') {
    return <span className="blink-dot" />;
  }
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never deployed';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AppCard({ app, onOpenDetail, onStart, onStop, onDeploy, onDelete }: AppCardProps) {
  const handleStart = () => {
    if (!app.lastDeployedAt) {
      showToast('⚠️ Deploy first before starting');
      return;
    }
    onStart();
  };

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--bdr)',
      borderRadius: 'var(--r2)',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Top row: name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={onOpenDetail}
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--amber)',
            fontFamily: 'var(--mono)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            textUnderlineOffset: 3,
          }}
        >
          {app.name}
        </button>
        <span className={statusBadgeClass(app.status)}>
          {statusDot(app.status)}
          {app.status}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
          :{app.port}
        </span>
      </div>

      {/* Chips row: lang, framework, mode */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {app.lang && (
          <span style={{
            fontSize: 11,
            fontFamily: 'var(--mono)',
            color: 'var(--teal)',
            background: 'rgba(61,214,200,0.07)',
            border: '1px solid rgba(61,214,200,0.18)',
            borderRadius: 20,
            padding: '2px 9px',
          }}>
            {app.lang}
          </span>
        )}
        {app.framework && (
          <span style={{
            fontSize: 11,
            fontFamily: 'var(--mono)',
            color: 'var(--violet)',
            background: 'rgba(167,139,250,0.07)',
            border: '1px solid rgba(167,139,250,0.18)',
            borderRadius: 20,
            padding: '2px 9px',
          }}>
            {app.framework}
          </span>
        )}
        <span style={{
          fontSize: 11,
          fontFamily: 'var(--mono)',
          color: 'var(--txt2)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--bdr3)',
          borderRadius: 20,
          padding: '2px 9px',
        }}>
          {app.mode}
        </span>
      </div>

      {/* Last deployed */}
      <div style={{ fontSize: 11.5, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
        {app.lastDeployedAt ? (
          <>Last deployed: <span style={{ color: 'var(--txt2)' }}>{formatDate(app.lastDeployedAt)}</span></>
        ) : (
          <span style={{ color: 'var(--txt3)' }}>Never deployed</span>
        )}
      </div>

      {/* Access links */}
      {(app.localUrl || app.externalUrl || app.giteaRepoUrl) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {app.localUrl && (
            <a
              href={app.localUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="domain-link"
              style={{ fontSize: 11 }}
            >
              ↗ Local
            </a>
          )}
          {app.externalUrl && (
            <a
              href={app.externalUrl}
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
              ↗ External
            </a>
          )}
          {app.giteaRepoUrl && (
            <a
              href={app.giteaRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="domain-link"
              style={{
                fontSize: 11,
                background: 'rgba(61,214,200,0.07)',
                borderColor: 'rgba(61,214,200,0.18)',
                color: 'var(--teal)',
              }}
            >
              ⎇ Gitea
            </a>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn bgrn bsm"
          onClick={handleStart}
          disabled={app.status === 'running'}
          style={{ opacity: app.status === 'running' ? 0.4 : 1, cursor: app.status === 'running' ? 'not-allowed' : 'pointer' }}
        >
          ▶ Start
        </button>
        <button
          className="btn br bsm"
          onClick={onStop}
          disabled={app.status === 'stopped'}
          style={{ opacity: app.status === 'stopped' ? 0.4 : 1, cursor: app.status === 'stopped' ? 'not-allowed' : 'pointer' }}
        >
          ■ Stop
        </button>
        <button
          className={`btn bt bsm${!app.lastDeployedAt ? ' btn-pulse-deploy' : ''}`}
          onClick={onDeploy}
        >
          ↑ Deploy
        </button>
        <button className="btn br bsm" onClick={onDelete}>
          ✕ Delete
        </button>
      </div>
    </div>
  );
}
