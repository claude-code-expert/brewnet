// T037 — DeploymentTab: deploy settings form + history + deploy now
import { useState, useEffect, useCallback } from 'react';
import { Save, Play, Loader, RefreshCw, Undo2 } from 'lucide-react';
import type { AppGitInfo, DeployHistoryEntry, DeploySettings } from '../types.js';
import { showToast } from './Toast.js';
import { useGiteaOpen } from '../hooks/useGiteaOpen.js';
import { useElapsed } from '../hooks/useElapsed.js';
import { useI18n } from '../i18n/useI18n.js';

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
  const { t } = useI18n();
  const openGitea = useGiteaOpen();
  const [deployBranch, setDeployBranch] = useState(initialSettings?.deployBranch ?? 'main');
  const [autoDeploy, setAutoDeploy]     = useState(initialSettings?.autoDeploy ?? false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deploying, setDeploying]       = useState(false);
  const [rollbackingHash, setRollbackingHash] = useState<string | null>(null);
  const deployElapsed   = useElapsed(deploying);
  const rollbackElapsed = useElapsed(!!rollbackingHash);
  const [history, setHistory]           = useState<DeployHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [branches, setBranches]         = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Sync if settings prop changes (on mount with fetched data)
  useEffect(() => {
    if (initialSettings) {
      setDeployBranch(initialSettings.deployBranch);
      setAutoDeploy(initialSettings.autoDeploy);
    }
  }, [initialSettings]);

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const res = await apiFetch(`/api/apps/${encodeURIComponent(appName)}/branches`);
      if (res.ok) {
        const data = await res.json() as { branches?: string[] };
        setBranches(data.branches ?? []);
      }
    } catch {
      // silent — branches list is optional
    } finally {
      setBranchesLoading(false);
    }
  }, [appName, apiFetch]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/deploy/history?app=${encodeURIComponent(appName)}`);
      if (res.ok) {
        const data = await res.json() as { history?: DeployHistoryEntry[] };
        setHistory((data.history ?? []).slice(-5));
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

  const handleRollback = async (commitHash: string) => {
    setRollbackingHash(commitHash);
    try {
      const res = await apiFetch(`/api/apps/${encodeURIComponent(appName)}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitHash }),
      });
      if (res.ok) {
        const data = await res.json() as { jobId?: string };
        if (data.jobId) {
          onDeployStarted(data.jobId);
          setTimeout(() => { loadHistory(); }, 2000);
        }
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        showToast(`Rollback error: ${err.error ?? res.statusText}`);
      }
    } catch (e) {
      showToast(`Rollback error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRollbackingHash(null);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* Git Repository */}
      {git && (
        <div className="card" style={{ padding: '10px 16px' }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Git Repository</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => openGitea(git.giteaUrl)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'var(--mono)',
                color: 'var(--teal)',
                textAlign: 'left',
              }}
            >
              ⎇ {git.giteaUrl}
            </button>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--txt2)', fontFamily: 'var(--mono)' }}>
                branch: <span style={{ color: 'var(--amber)' }}>{git.branch}</span>
              </span>
              {git.latestCommit && (
                <span style={{ fontSize: 11.5, color: 'var(--txt2)', fontFamily: 'var(--mono)' }}>
                  latest: <span style={{ color: 'var(--txt2)' }}>{git.latestCommit.shortHash}</span>
                  {' '}<span style={{ color: 'var(--txt2)' }}>{git.latestCommit.message}</span>
                </span>
              )}
            </div>

            <input
              className="fi"
              readOnly
              value={git.cloneUrlHttp}
              style={{ fontFamily: 'var(--mono)', fontSize: 11, cursor: 'text' }}
              onFocus={(e) => e.target.select()}
            />

            <div style={{
              fontSize: 11.5,
              color: 'var(--txt2)',
              background: 'rgba(232,168,73,0.05)',
              border: '1px solid rgba(232,168,73,0.12)',
              borderRadius: 'var(--r)',
              padding: '8px 12px',
            }}>
              💡 {t('deployment.gitea_hint', 'Gitea 로그인은 brewnet 설치 시 설정한 관리자 계정을 사용하세요. 앱 생성 시 이 저장소가 자동으로 만들어지고 코드가 push됩니다.')}
            </div>
          </div>
        </div>
      )}

      {/* Deploy Settings */}
      <div className="card" style={{ padding: '10px 20px' }}>
        <div className="section-title" style={{ marginBottom: 16 }}>Deploy Settings</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 16px', alignItems: 'end' }}>
          {/* Deploy Branch — spans 2 cols */}
          <div style={{ gridColumn: '1 / 3', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Deploy Branch
            </label>
            {branches.length > 0 ? (
              <select
                className="fi"
                value={deployBranch}
                onChange={(e) => setDeployBranch(e.target.value)}
                style={{ fontFamily: 'var(--mono)', cursor: 'pointer' }}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    flex: 1,
                  }}
                />
                {branchesLoading && <Loader size={13} className="spin" style={{ color: 'var(--txt2)' }} />}
              </div>
            )}
            {git && git.branch && deployBranch !== git.branch && (
              <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
                Current repo branch: <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{git.branch}</span>
              </div>
            )}
          </div>

          {/* Auto Deploy — col 3 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 9 }}>
            <input
              type="checkbox"
              checked={autoDeploy}
              onChange={(e) => setAutoDeploy(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--amber)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--txt2)' }}>Auto Deploy</span>
          </label>

          {/* Save Settings — col 4 */}
          <button
            className="btn bp"
            onClick={handleSaveSettings}
            disabled={savingSettings}
            style={{ opacity: savingSettings ? 0.6 : 1, justifySelf: 'end' }}
          >
            {savingSettings ? <Loader size={14} className="spin" /> : <><Save size={14} /> Save</>}
          </button>
        </div>
      </div>

      {/* Manual Deploy */}
      <div className="card" style={{ padding: '10px 20px' }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Manual Deploy</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--txt2)', flex: 1, minWidth: 180 }}>
            Deploy latest commit from{' '}
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{deployBranch}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {history.length === 0 ? (
              /* First deploy ever */
              <button
                className="btn bp"
                onClick={handleDeployNow}
                disabled={deploying || !!rollbackingHash}
                style={{ opacity: deploying ? 0.6 : 1 }}
              >
                {deploying ? <><Loader size={14} className="spin" /> Deploying…{deployElapsed > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, marginLeft: 4 }}>({deployElapsed}s)</span>}</> : <><Play size={14} /> Deploy Now</>}
              </button>
            ) : (
              /* Already deployed — show Redeploy + Rollback */
              <>
                <button
                  className="btn bp"
                  onClick={handleDeployNow}
                  disabled={deploying || !!rollbackingHash}
                  style={{ opacity: deploying || !!rollbackingHash ? 0.6 : 1 }}
                  title="Redeploy latest commit on branch"
                >
                  {deploying ? <><Loader size={14} className="spin" /> Redeploying…{deployElapsed > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, marginLeft: 4 }}>({deployElapsed}s)</span>}</> : <><RefreshCw size={14} /> Redeploy</>}
                </button>
                {history.length >= 2 && (
                  <button
                    className="btn bg"
                    onClick={() => {
                      // history is oldest-first; [length-2] is the one before the latest
                      const prev = history[history.length - 2];
                      void handleRollback(prev?.commitHash ?? '');
                    }}
                    disabled={deploying || !!rollbackingHash}
                    style={{ opacity: deploying || !!rollbackingHash ? 0.6 : 1 }}
                    title="Roll back to previous deployment"
                  >
                    {rollbackingHash ? <><Loader size={14} className="spin" /> Rolling back…{rollbackElapsed > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, marginLeft: 4 }}>({rollbackElapsed}s)</span>}</> : <><Undo2 size={14} /> Rollback</>}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Deploy History */}
      <div className="card" style={{ padding: '10px 20px' }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Deploy History</div>

        {historyLoading ? (
          <div style={{ color: 'var(--txt2)', fontSize: 13 }}>Loading history…</div>
        ) : history.length === 0 ? (
          <div style={{ color: 'var(--txt2)', fontSize: 13, fontStyle: 'italic' }}>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', fontSize: 12 }}>
                        {entry.commitHash ? shortHash(entry.commitHash) : '—'}
                      </span>
                    </td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.commitMessage}
                    </td>
                    <td>
                      <HistoryStatusBadge status={entry.status} />
                    </td>
                    <td style={{ color: 'var(--txt2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatDate(entry.deployedAt)}
                    </td>
                    <td>
                      {i < history.length - 1 && (
                        <button
                          className="btn bg"
                          onClick={() => void handleRollback(entry.commitHash ?? '')}
                          disabled={!!rollbackingHash || deploying}
                          style={{ opacity: rollbackingHash === entry.commitHash ? 0.6 : 1, fontSize: 11.5, padding: '4px 10px' }}
                          title={entry.commitHash ? `Rollback to ${shortHash(entry.commitHash)}` : 'Rollback to this deployment'}
                        >
                          {rollbackingHash === entry.commitHash
                            ? <Loader size={12} className="spin" />
                            : <><Undo2 size={12} /> Rollback</>}
                        </button>
                      )}
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
