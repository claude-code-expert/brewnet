// T035 — AppDetail: 4-tab detail page for a deployed app
import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth-context.js';
import { usePolling } from '../hooks/usePolling.js';
import { NavHeader } from '../components/NavHeader.js';
import { ProgressModal } from '../components/ProgressModal.js';
import { OverviewTab } from '../components/OverviewTab.js';
import { DeploymentTab } from '../components/DeploymentTab.js';
import { AppLogsTab } from '../components/AppLogsTab.js';
import { DomainTab } from '../components/DomainTab.js';
import type { AppEntry, AppGitInfo, DeploySettings, BoilerplateMeta } from '../types.js';

type Tab = 'overview' | 'deployment' | 'logs' | 'domain';

export function AppDetail() {
  const { name } = useParams<{ name: string }>();
  const { apiFetch } = useAuth();

  const [app, setApp]               = useState<AppEntry | null>(null);
  const [git, setGit]               = useState<AppGitInfo | null>(null);
  const [settings, setSettings]     = useState<DeploySettings | null>(null);
  const [boilerplate, setBoilerplate] = useState<BoilerplateMeta | null>(null);
  const [notFound, setNotFound]     = useState(false);
  const [activeTab, setActiveTab]   = useState<Tab>('overview');

  // Deploy progress modal state
  const [progressJob, setProgressJob] = useState<{ jobId: string; appName: string } | null>(null);

  // Fetch wrapper: transparently passes through data but catches 404 for not-found detection
  const appAwareFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await apiFetch(url, init);
      if (res.status === 404) {
        setNotFound(true);
        setApp(null);
        // Return a fake empty-ok response so usePolling doesn't error
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return res;
    },
    [apiFetch],
  );

  // Stable onData callback for app polling
  const handleAppData = useCallback((data: unknown) => {
    const d = data as { app?: AppEntry };
    if (d?.app) {
      setApp(d.app);
      setNotFound(false);
    }
  }, []);

  // Poll app info every 5s (uses 404-aware fetch)
  const appUrl = name ? `/api/apps/${encodeURIComponent(name)}` : '';
  usePolling(appUrl, 5000, appAwareFetch, handleAppData, !!name);

  // Fetch boilerplate metadata once the app's stackId is known (stable after first poll)
  useEffect(() => {
    if (!name || !app) return;
    apiFetch('/api/apps/boilerplates')
      .then((r) => r.ok ? r.json() : null)
      .then((d: unknown) => {
        const list = (d as { boilerplates?: BoilerplateMeta[] })?.boilerplates ?? [];
        // match by appDir first (unique per app), fallback to stackId
        const matched =
          list.find((bp) => bp.appDir && app.appDir && bp.appDir === app.appDir) ??
          list.find((bp) => bp.stackId === app.stackId) ??
          null;
        setBoilerplate(matched);
      })
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, app?.stackId]);

  // Fetch git info once on mount (silently fail on 502 / non-ok)
  const gitFetch = useCallback(
    (url: string, init?: RequestInit) =>
      apiFetch(url, init).then((r) => (r.ok ? r : new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))),
    [apiFetch],
  );
  const handleGitData = useCallback((data: unknown) => {
    const d = data as { git?: AppGitInfo };
    if (d?.git) setGit(d.git);
  }, []);
  usePolling(
    name ? `/api/apps/${encodeURIComponent(name)}/git` : '',
    0,
    gitFetch,
    handleGitData,
    !!name,
  );

  // Fetch deploy settings once on mount (silently fail)
  const handleSettingsData = useCallback((data: unknown) => {
    const d = data as { autoDeploy?: boolean; deployBranch?: string; webhookSecret?: string };
    if (d && typeof d.autoDeploy !== 'undefined') {
      setSettings({
        autoDeploy: d.autoDeploy,
        deployBranch: d.deployBranch ?? 'main',
        webhookSecret: d.webhookSecret,
      });
    }
  }, []);
  usePolling(
    name ? `/api/apps/${encodeURIComponent(name)}/deploy/settings` : '',
    0,
    gitFetch, // same silent-fail wrapper
    handleSettingsData,
    !!name,
  );

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

  if (!name) {
    return (
      <>
        <NavHeader />
        <div id="content">
          <p style={{ color: 'var(--txt2)', padding: '40px' }}>Invalid app name.</p>
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <NavHeader />
        <div id="topbar">
          <div className="bc">
            <Link to="/apps" style={{ color: 'var(--txt2)', textDecoration: 'none' }}>Apps</Link>
            <span className="bc-sep">›</span>
            <span className="cur">{name}</span>
          </div>
        </div>
        <div id="content">
          <div style={{
            padding: '60px 0',
            textAlign: 'center',
            color: 'var(--txt3)',
            fontSize: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ color: 'var(--txt2)', fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
              App not found
            </div>
            <div style={{ marginBottom: 20 }}>
              No app named <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{name}</span> was found.
            </div>
            <Link
              to="/apps"
              style={{
                color: 'var(--teal)',
                textDecoration: 'none',
                fontSize: 13,
                border: '1px solid var(--bdr2)',
                borderRadius: 'var(--r)',
                padding: '7px 16px',
              }}
            >
              ← Back to Apps
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavHeader />

      {/* Topbar breadcrumb */}
      <div id="topbar">
        <div className="bc">
          <Link to="/apps" style={{ color: 'var(--txt2)', textDecoration: 'none' }}>Apps</Link>
          <span className="bc-sep">›</span>
          <span className="cur">{name}</span>
        </div>
        <div className="tbr">
          {app && (
            <span
              className={`bdg ${
                app.status === 'running'  ? 'b-run'
                : app.status === 'stopped'  ? 'b-stop'
                : app.status === 'creating' ? 'b-build'
                : 'b-stop'
              }`}
            >
              {app.status}
            </span>
          )}
        </div>
      </div>

      <div id="content">
        {/* Loading state */}
        {!app && !notFound && (
          <div style={{ color: 'var(--txt3)', fontSize: 13, padding: '20px 0' }}>
            Loading app details…
          </div>
        )}

        {app && (
          <>
            {/* Tab row */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              <button style={tabStyle('overview')}   onClick={() => setActiveTab('overview')}>Overview</button>
              <button style={tabStyle('deployment')} onClick={() => setActiveTab('deployment')}>Deployment</button>
              <button style={tabStyle('logs')}       onClick={() => setActiveTab('logs')}>Logs</button>
              <button style={tabStyle('domain')}     onClick={() => setActiveTab('domain')}>Domain</button>
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
              <OverviewTab app={app} git={git} boilerplate={boilerplate} />
            )}

            {activeTab === 'deployment' && (
              <DeploymentTab
                appName={name}
                git={git}
                settings={settings}
                apiFetch={apiFetch}
                onDeployStarted={(jobId) => setProgressJob({ jobId, appName: name })}
              />
            )}

            {activeTab === 'logs' && (
              <AppLogsTab appName={name} />
            )}

            {activeTab === 'domain' && (
              <DomainTab appName={name} apiFetch={apiFetch} />
            )}
          </>
        )}
      </div>

      {/* Deploy Progress Modal */}
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
