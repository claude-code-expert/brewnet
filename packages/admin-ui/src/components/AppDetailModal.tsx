import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth-context.js';
import { usePolling } from '../hooks/usePolling.js';
import { ProgressModal } from './ProgressModal.js';
import { OverviewTab } from './OverviewTab.js';
import { DeploymentTab } from './DeploymentTab.js';
import { AppLogsTab } from './AppLogsTab.js';
import { DomainTab } from './DomainTab.js';
import type { AppEntry, AppGitInfo, DeploySettings, BoilerplateMeta } from '../types.js';

type Tab = 'overview' | 'deployment' | 'logs' | 'domain';

interface AppDetailModalProps {
  appName: string;
  onClose: () => void;
}

export function AppDetailModal({ appName, onClose }: AppDetailModalProps) {
  const { apiFetch } = useAuth();

  const [app, setApp]                 = useState<AppEntry | null>(null);
  const [git, setGit]                 = useState<AppGitInfo | null>(null);
  const [settings, setSettings]       = useState<DeploySettings | null>(null);
  const [boilerplate, setBoilerplate] = useState<BoilerplateMeta | null>(null);
  const [notFound, setNotFound]       = useState(false);
  const [activeTab, setActiveTab]     = useState<Tab>('overview');
  const [progressJob, setProgressJob] = useState<{ jobId: string; appName: string } | null>(null);

  // 404-aware fetch wrapper
  const appAwareFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await apiFetch(url, init);
      if (res.status === 404) {
        setNotFound(true);
        setApp(null);
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return res;
    },
    [apiFetch],
  );

  const handleAppData = useCallback((data: unknown) => {
    const d = data as { app?: AppEntry };
    if (d?.app) { setApp(d.app); setNotFound(false); }
  }, []);

  usePolling(`/api/apps/${encodeURIComponent(appName)}`, 5000, appAwareFetch, handleAppData, true);

  // Silent-fail fetch for git + settings
  const silentFetch = useCallback(
    (url: string, init?: RequestInit) =>
      apiFetch(url, init).then((r) => r.ok ? r : new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    [apiFetch],
  );

  usePolling(`/api/apps/${encodeURIComponent(appName)}/git`, 30000, silentFetch,
    useCallback((data: unknown) => {
      const d = data as { git?: AppGitInfo };
      if (d?.git) setGit(d.git);
    }, []), true);

  usePolling(`/api/apps/${encodeURIComponent(appName)}/deploy/settings`, 30000, silentFetch,
    useCallback((data: unknown) => {
      const d = data as { autoDeploy?: boolean; deployBranch?: string; webhookSecret?: string };
      if (d && typeof d.autoDeploy !== 'undefined') {
        setSettings({ autoDeploy: d.autoDeploy, deployBranch: d.deployBranch ?? 'main', webhookSecret: d.webhookSecret });
      }
    }, []), true);

  // Boilerplate metadata (one-time)
  useEffect(() => {
    apiFetch('/api/apps/boilerplates')
      .then((r) => r.ok ? r.json() : null)
      .then((d: unknown) => {
        const list = (d as { boilerplates?: BoilerplateMeta[] })?.boilerplates ?? [];
        const matched =
          list.find((bp) => app && bp.appDir && app.appDir && bp.appDir === app.appDir) ??
          list.find((bp) => bp.stackId === app?.stackId) ??
          null;
        setBoilerplate(matched);
      })
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName, app?.appDir]);

  const tabStyle = (tab: Tab) => ({
    padding: '7px 16px',
    borderRadius: 'var(--r)',
    border: activeTab === tab ? '1px solid rgba(232,168,73,0.3)' : '1px solid transparent',
    background: activeTab === tab ? 'rgba(232,168,73,0.07)' : 'transparent',
    color: activeTab === tab ? 'var(--amber)' : 'var(--txt2)',
    cursor: 'pointer' as const,
    fontSize: 12.5,
    fontWeight: activeTab === tab ? 600 : 400,
    transition: 'all 0.14s',
  });

  return (
    <>
      <div className="overlay" onClick={onClose}>
        <div
          className="modal"
          style={{ maxWidth: 740, width: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--bdr)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>
                {appName}
              </span>
              {app && (
                <span className={`bdg ${
                  app.status === 'running'  ? 'b-run'
                  : app.status === 'stopped'  ? 'b-stop'
                  : app.status === 'creating' ? 'b-build'
                  : 'b-stop'
                }`}>
                  {(app.status === 'running' || app.status === 'creating') && <span className="blink-dot" />}
                  {app.status}
                </span>
              )}
            </div>
            <button className="xbtn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Tab bar */}
          {app && (
            <div style={{ display: 'flex', gap: 4, padding: '10px 20px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
              <button style={tabStyle('overview')}   onClick={() => setActiveTab('overview')}>Overview</button>
              <button style={tabStyle('deployment')} onClick={() => setActiveTab('deployment')}>Deployment</button>
              <button style={tabStyle('logs')}       onClick={() => setActiveTab('logs')}>Logs</button>
              <button style={tabStyle('domain')}     onClick={() => setActiveTab('domain')}>Domain</button>
            </div>
          )}

          {/* Body */}
          <div style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>
            {/* Loading */}
            {!app && !notFound && (
              <div style={{ color: 'var(--txt3)', fontSize: 13, padding: '20px 0' }}>
                Loading app details…
              </div>
            )}

            {/* Not found */}
            {notFound && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--txt3)', fontSize: 14 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
                <div style={{ color: 'var(--txt2)', fontWeight: 600, marginBottom: 6 }}>App not found</div>
                <div>
                  No app named{' '}
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{appName}</span> was found.
                </div>
              </div>
            )}

            {/* Tab content */}
            {app && (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab app={app} git={git} boilerplate={boilerplate} />
                )}
                {activeTab === 'deployment' && (
                  <DeploymentTab
                    appName={appName}
                    git={git}
                    settings={settings}
                    apiFetch={apiFetch}
                    onDeployStarted={(jobId) => setProgressJob({ jobId, appName })}
                  />
                )}
                {activeTab === 'logs' && (
                  <AppLogsTab appName={appName} />
                )}
                {activeTab === 'domain' && (
                  <DomainTab appName={appName} apiFetch={apiFetch} />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {progressJob && (
        <ProgressModal
          jobId={progressJob.jobId}
          appName={progressJob.appName}
          apiFetch={apiFetch}
          onClose={() => setProgressJob(null)}
          onComplete={() => setProgressJob(null)}
        />
      )}
    </>
  );
}
