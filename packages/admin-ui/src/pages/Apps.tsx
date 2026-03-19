// T028 + T034 — Apps page: app list, create/start/stop/deploy/delete + settings tab
import { useState, useCallback } from 'react';
import { useAuth } from '../auth-context.js';
import { usePolling } from '../hooks/usePolling.js';
import type { AppEntry, GitRepoEntry } from '../types.js';
import { NavHeader } from '../components/NavHeader.js';
import { AppCard } from '../components/AppCard.js';
import { CreateAppModal } from '../components/CreateAppModal.js';
import { ProgressModal } from '../components/ProgressModal.js';
import { SettingsTab } from '../components/SettingsTab.js';
import { showToast } from '../components/Toast.js';

type Tab = 'apps' | 'settings';

export function Apps() {
  const { apiFetch } = useAuth();

  const [apps, setApps]             = useState<AppEntry[]>([]);
  const [, setRepos]                = useState<GitRepoEntry[]>([]);
  const [activeTab, setActiveTab]   = useState<Tab>('apps');
  const [showCreate, setShowCreate] = useState(false);
  const [progressJob, setProgressJob] = useState<{ jobId: string; appName: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null); // app name being actioned

  // Poll /api/apps every 5 s
  const handleAppsData = useCallback((data: unknown) => {
    const d = data as { apps?: AppEntry[] };
    if (d?.apps) setApps(d.apps);
  }, []);
  usePolling('/api/apps', 5000, apiFetch, handleAppsData);

  // Silently fetch git repos (plain fetch, no auth error toast on 502)
  usePolling(
    '/api/git/repos',
    30000,
    // plain fetch wrapper — ignore errors silently
    (url: string) => fetch(url).catch(() => new Response('[]', { status: 502 })),
    useCallback((data: unknown) => {
      const d = data as { repos?: GitRepoEntry[] };
      if (d?.repos) setRepos(d.repos);
    }, []),
  );

  // Generic app action helper
  const appAction = async (
    appName: string,
    method: string,
    path: string,
    onSuccess?: (body: unknown) => void,
  ) => {
    setActionBusy(appName);
    try {
      const res = await apiFetch(`/api/apps/${appName}${path}`, { method });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        showToast(`Error: ${err.error ?? res.statusText}`);
        return;
      }
      const body: unknown = await res.json().catch(() => ({}));
      onSuccess?.(body);
      // Refresh app list
      const listRes = await apiFetch('/api/apps');
      if (listRes.ok) {
        const listData = await listRes.json() as { apps?: AppEntry[] };
        if (listData?.apps) setApps(listData.apps);
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleStart  = (name: string) => appAction(name, 'POST', '/start');
  const handleStop   = (name: string) => appAction(name, 'POST', '/stop');
  const handleDeploy = (name: string) => {
    appAction(name, 'POST', '/deploy', (body) => {
      const b = body as { jobId?: string };
      if (b?.jobId) {
        setProgressJob({ jobId: b.jobId, appName: name });
      }
    });
  };
  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete app "${name}"? This cannot be undone.`)) return;
    await appAction(name, 'DELETE', '', () => {
      showToast(`App "${name}" deleted`);
    });
  };

  const handleCreated = (jobId: string, appName: string) => {
    setShowCreate(false);
    setProgressJob({ jobId, appName });
  };

  const handleProgressComplete = async () => {
    // Refresh app list
    try {
      const res = await apiFetch('/api/apps');
      if (res.ok) {
        const data = await res.json() as { apps?: AppEntry[] };
        if (data?.apps) setApps(data.apps);
      }
    } catch {
      // ignore
    }
  };

  const tabStyle = (tab: Tab) => ({
    padding: '8px 18px',
    borderRadius: 'var(--r)',
    border: activeTab === tab ? '1px solid rgba(232,168,73,0.3)' : '1px solid transparent',
    background: activeTab === tab ? 'rgba(232,168,73,0.07)' : 'transparent',
    color: activeTab === tab ? 'var(--amber)' : 'var(--txt2)',
    cursor: 'pointer' as const,
    fontSize: 13,
    fontWeight: activeTab === tab ? 600 : 400,
    transition: 'all 0.14s',
  });

  return (
    <div id="main">
      <NavHeader />
      {/* Topbar */}
      <div id="topbar">
        <div className="bc">
          <span className="cur">Apps</span>
        </div>
        <div className="tbr">
          <button className="btn bp bsm" onClick={() => setShowCreate(true)}>
            + Create New App
          </button>
        </div>
      </div>

      <div id="content">
        {/* Tab row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          <button style={tabStyle('apps')}    onClick={() => setActiveTab('apps')}>Apps</button>
          <button style={tabStyle('settings')} onClick={() => setActiveTab('settings')}>Settings</button>
        </div>

        {/* Apps tab */}
        {activeTab === 'apps' && (
          <div>
            {apps.length === 0 ? (
              <div style={{
                padding: '60px 0',
                textAlign: 'center',
                color: 'var(--txt3)',
                fontSize: 14,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
                <div>No apps yet.</div>
                <div style={{ marginTop: 6, fontSize: 12.5 }}>
                  Click <strong style={{ color: 'var(--amber)' }}>+ Create New App</strong> to get started.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {apps.map((app) => (
                  <div
                    key={app.name}
                    style={{ opacity: actionBusy === app.name ? 0.6 : 1, transition: 'opacity 0.15s', pointerEvents: actionBusy === app.name ? 'none' : 'auto' }}
                  >
                    <AppCard
                      app={app}
                      onStart={() => handleStart(app.name)}
                      onStop={() => handleStop(app.name)}
                      onDeploy={() => handleDeploy(app.name)}
                      onDelete={() => handleDelete(app.name)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <SettingsTab apiFetch={apiFetch} />
        )}
      </div>

      {/* Create App Modal */}
      {showCreate && (
        <CreateAppModal
          apiFetch={apiFetch}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Progress Modal */}
      {progressJob && (
        <ProgressModal
          jobId={progressJob.jobId}
          appName={progressJob.appName}
          apiFetch={apiFetch}
          onClose={() => setProgressJob(null)}
          onComplete={handleProgressComplete}
        />
      )}
    </div>
  );
}
