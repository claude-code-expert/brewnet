// T037 — DeploymentTab: deploy settings form + history + deploy now
import { useState, useEffect, useCallback } from 'react';
import type { AppGitInfo, DeployHistoryEntry, DeploySettings } from '../types.js';
import { showToast } from './Toast.js';

type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

interface DeploymentTabProps {
  appName: string;
  git: AppGitInfo | null;
  settings: DeploySettings | null;
  apiFetch: ApiFetch;
  onDeployStarted: (jobId: string) => void;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortHash(hash: string) {
  return hash.slice(0, 7);
}

function HistoryStatusBadge({ status }: { status: DeployHistoryEntry['status'] }) {
  const cls = status === 'success' ? 'bdg b-run' : 'bdg b-stop';
  return <span className={cls}>{status}</span>;
}

export function DeploymentTab({ appName, git, settings: initialSettings, apiFetch, onDeployStarted }: DeploymentTabProps) {
  const [deployBranch, setDeployBranch] = useState(initialSettings?.deployBranch ?? 'main');
  const [autoDeploy, setAutoDeploy]     = useState(initialSettings?.autoDeploy ?? false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deploying, setDeploying]       = useState(false);
  const [history, setHistory]           = useState<DeployHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Sync if settings prop changes (on mount with fetched data)
  useEffect(() => {
    if (initialSettings) {
      setDeployBranch(initialSettings.deployBranch);
      setAutoDeploy(initialSettings.autoDeploy);
    }
  }, [initialSettings]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/deploy/history?app=${encodeURIComponent(appName)}`);
      if (res.ok) {
        const data = await res.json() as { history?: DeployHistoryEntry[] };
        setHistory(data.history ?? []);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [appName, apiFetch]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await apiFetch(`/api/apps/${encodeURIComponent(appName)}/deploy/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoDeploy, deployBranch }),
      });
      if (res.ok) {
        showToast('Deploy settings saved');
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        showToast(`Error: ${err.error ?? res.statusText}`);
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeployNow = async () => {
    setDeploying(true);
    try {
      const res = await apiFetch(`/api/apps/${encodeURIComponent(appName)}/deploy`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { jobId?: string };
        if (data.jobId) {
          onDeployStarted(data.jobId);
          // Refresh history after short delay
          setTimeout(() => { loadHistory(); }, 2000);
        } else {
          showToast('Deploy started (no job ID returned)');
        }
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        showToast(`Deploy error: ${err.error ?? res.statusText}`);
      }
    } catch (e) {
      showToast(`Deploy error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Git Repository */}
      {git && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Git Repository</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href={`/api/gitea/autologin?redirect=${encodeURIComponent(new URL(git.giteaUrl).pathname)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 13,
                fontFamily: 'var(--mono)',
                color: 'var(--teal)',
                textDecoration: 'none',
              }}
            >
              ⎇ {git.giteaUrl}
            </a>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                branch: <span style={{ color: 'var(--amber)' }}>{git.branch}</span>
              </span>
              {git.latestCommit && (
                <span style={{ fontSize: 11.5, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                  latest: <span style={{ color: 'var(--txt2)' }}>{git.latestCommit.shortHash}</span>
                  {' '}<span style={{ color: 'var(--txt3)' }}>{git.latestCommit.message}</span>
                </span>
              )}
            </div>

            <code style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt3)', background: 'var(--bg0)', border: '1px solid var(--bdr)', borderRadius: 4, padding: '4px 8px', wordBreak: 'break-all' }}>
              {git.cloneUrlHttp}
            </code>

            <div style={{
              fontSize: 11.5,
              color: 'var(--txt3)',
              background: 'rgba(232,168,73,0.05)',
              border: '1px solid rgba(232,168,73,0.12)',
              borderRadius: 'var(--r)',
              padding: '8px 12px',
              lineHeight: 1.6,
            }}>
              💡 Gitea 로그인은 brewnet 설치 시 설정한 관리자 계정을 사용하세요.
              <br />
              앱 생성 시 이 저장소가 자동으로 만들어지고 코드가 push됩니다.
            </div>
          </div>
        </div>
      )}

      {/* Deploy Settings */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="section-title" style={{ marginBottom: 16 }}>Deploy Settings</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Deploy Branch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Deploy Branch
            </label>
            <input
              type="text"
              value={deployBranch}
              onChange={(e) => setDeployBranch(e.target.value)}
              placeholder="main"
              style={{
                background: 'var(--bg0)',
                border: '1px solid var(--bdr2)',
                borderRadius: 'var(--r)',
                padding: '8px 12px',
                color: 'var(--txt)',
                fontSize: 13,
                fontFamily: 'var(--mono)',
                outline: 'none',
                maxWidth: 300,
              }}
            />
            {git && git.branch && deployBranch !== git.branch && (
              <div style={{ fontSize: 11.5, color: 'var(--txt3)' }}>
                Current repo branch: <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{git.branch}</span>
              </div>
            )}
          </div>

          {/* Auto Deploy toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoDeploy}
                onChange={(e) => setAutoDeploy(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--amber)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: 'var(--txt2)' }}>
                Auto Deploy on push
              </span>
            </label>
          </div>

          <div>
            <button
              className="btn bp bsm"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              style={{ opacity: savingSettings ? 0.6 : 1 }}
            >
              {savingSettings ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Deploy Now */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="section-title" style={{ marginBottom: 8 }}>Manual Deploy</div>
        <div style={{ fontSize: 12.5, color: 'var(--txt3)', marginBottom: 14 }}>
          Deploy the latest commit from branch{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{deployBranch}</span>
        </div>
        <button
          className="btn bp"
          onClick={handleDeployNow}
          disabled={deploying}
          style={{ opacity: deploying ? 0.6 : 1 }}
        >
          {deploying ? '◌ Starting deploy…' : '▶ Deploy Now'}
        </button>
      </div>

      {/* Deploy History */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="section-title">Deploy History</div>
          <button
            className="btn bg bsm"
            onClick={loadHistory}
            disabled={historyLoading}
            style={{ fontSize: 11.5, opacity: historyLoading ? 0.6 : 1 }}
          >
            {historyLoading ? '…' : '↻ Refresh'}
          </button>
        </div>

        {historyLoading ? (
          <div style={{ color: 'var(--txt3)', fontSize: 13 }}>Loading history…</div>
        ) : history.length === 0 ? (
          <div style={{ color: 'var(--txt3)', fontSize: 13, fontStyle: 'italic' }}>
            No deployments yet
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl">
              <thead>
                <tr>
                  <th>Commit</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', fontSize: 12 }}>
                        {shortHash(entry.commitHash)}
                      </span>
                    </td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.commitMessage}
                    </td>
                    <td>
                      <HistoryStatusBadge status={entry.status} />
                    </td>
                    <td style={{ color: 'var(--txt2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatDate(entry.deployedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
