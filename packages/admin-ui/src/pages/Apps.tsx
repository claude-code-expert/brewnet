// T028 + T034 — Apps page: app list, create/start/stop/deploy/delete
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth-context.js';
import { usePolling } from '../hooks/usePolling.js';
import type { AppEntry, DomainConnection, ConfigResponse } from '../types.js';
import { NavHeader } from '../components/NavHeader.js';
import { Footer } from '../components/Footer.js';
import { AppCard } from '../components/AppCard.js';
import { CreateAppModal } from '../components/CreateAppModal.js';
import { ProgressModal } from '../components/ProgressModal.js';
import { CloudflareTunnelModal } from '../features/domain/index.js';
import { AppDetailModal } from '../components/AppDetailModal.js';
import { ExternalDomainsSection } from '../components/ExternalDomainsSection.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { showToast } from '../components/Toast.js';

interface DomainListResponse {
  connections?: DomainConnection[];
  domainConnections?: DomainConnection[];
}

export function Apps() {
  const { apiFetch } = useAuth();

  const [apps, setApps]             = useState<AppEntry[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showDomainSetting, setShowDomainSetting] = useState(false);
  const [domainSourceApp, setDomainSourceApp] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [selectedAppInitialTab, setSelectedAppInitialTab] = useState<'overview' | 'deployment' | 'logs' | 'domain'>('overview');
  const [progressJob, setProgressJob] = useState<{ jobId: string; appName: string; type: 'create' | 'deploy' } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [connections, setConnections] = useState<DomainConnection[]>([]);
  const [tunnelId, setTunnelId]       = useState('');
  const [zoneName, setZoneName]       = useState('');

  // Load domain connections + config once on mount
  useEffect(() => {
    let cancelled = false;

    const loadExtras = async () => {
      const [domainRes, configRes] = await Promise.allSettled([
        apiFetch('/api/domain/list'),
        apiFetch('/api/config'),
      ]);
      if (cancelled) return;

      if (domainRes.status === 'fulfilled' && domainRes.value.ok) {
        const d = await domainRes.value.json() as DomainListResponse;
        if (!cancelled) setConnections(d.connections ?? d.domainConnections ?? []);
      }
      if (configRes.status === 'fulfilled' && configRes.value.ok) {
        const d = await configRes.value.json() as ConfigResponse;
        if (!cancelled) {
          setTunnelId(d.tunnelId ?? '');
          setZoneName(d.zoneName ?? '');
        }
      }
    };

    void loadExtras();
    return () => { cancelled = true; };
  }, [apiFetch]);

  // Poll /api/apps every 5 s
  const handleAppsData = useCallback((data: unknown) => {
    const d = data as { apps?: AppEntry[] };
    if (d?.apps) setApps(d.apps);
  }, []);
  usePolling('/api/apps', 5000, apiFetch, handleAppsData);

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

  const handleStart  = (name: string) => appAction(name, 'POST', '/start', () => showToast(`✓ "${name}" started`));
  const handleStop   = (name: string) => appAction(name, 'POST', '/stop',  () => showToast(`✓ "${name}" stopped`));
  const handleDeploy = (name: string) => {
    appAction(name, 'POST', '/deploy', (body) => {
      const b = body as { jobId?: string };
      if (b?.jobId) setProgressJob({ jobId: b.jobId, appName: name, type: 'deploy' });
    });
  };
  const handleDelete = (name: string) => {
    setConfirmDelete(name);
  };

  const doDelete = async (name: string) => {
    setConfirmDelete(null);
    await appAction(name, 'DELETE', '', () => {
      showToast(`✓ App "${name}" has been deleted.`);
    });
  };

  const handleCreated = (jobId: string, appName: string) => {
    setShowCreate(false);
    setProgressJob({ jobId, appName, type: 'create' });
  };

  const handleProgressComplete = async () => {
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

  return (
    <div id="main">
      <NavHeader />

      <div id="topbar">
        <div className="bc">
          <span className="cur">Apps</span>
        </div>
        <div className="tbr">
          <button
            className="btn bg bsm"
            onClick={() => setShowDomainSetting(true)}
          >
            ⚙ Domain Setting
          </button>
          <button className="btn bp bsm" onClick={() => setShowCreate(true)}>
            + Create New App
          </button>
        </div>
      </div>

      <div id="content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, minHeight: 'calc(100% - 50px)' }}>
          {/* App cards */}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 350px)', gap: 16 }}>
              {apps.map((app) => (
                <div
                  key={app.name}
                  style={{ opacity: actionBusy === app.name ? 0.6 : 1, transition: 'opacity 0.15s', pointerEvents: actionBusy === app.name ? 'none' : 'auto' }}
                >
                  <AppCard
                    app={app}
                    onOpenDetail={() => setSelectedApp(app.name)}
                    onStart={() => handleStart(app.name)}
                    onStop={() => handleStop(app.name)}
                    onDeploy={() => handleDeploy(app.name)}
                    onDelete={() => handleDelete(app.name)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* External domain connections */}
          <ExternalDomainsSection
            connections={connections}
            tunnelId={tunnelId}
            zoneName={zoneName}
          />
        </div>

      </div>
      <Footer />

      {/* Modals */}
      {showCreate && (
        <CreateAppModal
          apiFetch={apiFetch}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showDomainSetting && (
        <CloudflareTunnelModal
          apiFetch={apiFetch}
          onClose={() => { setShowDomainSetting(false); setDomainSourceApp(null); }}
          onComplete={() => {
            setShowDomainSetting(false);
            if (domainSourceApp) {
              setSelectedApp(domainSourceApp);
              setSelectedAppInitialTab('domain');
            }
            setDomainSourceApp(null);
            showToast('Cloudflare Tunnel setup complete. Connect your apps from the Domain tab.');
          }}
        />
      )}

      {selectedApp && (
        <AppDetailModal
          appName={selectedApp}
          initialTab={selectedAppInitialTab}
          onClose={() => { setSelectedApp(null); setSelectedAppInitialTab('overview'); }}
          onOpenDomainSettings={() => {
            setDomainSourceApp(selectedApp);
            setSelectedApp(null);
            setSelectedAppInitialTab('overview');
            setShowDomainSetting(true);
          }}
        />
      )}

      {progressJob && (
        <ProgressModal
          jobId={progressJob.jobId}
          appName={progressJob.appName}
          jobType={progressJob.type}
          apiFetch={apiFetch}
          onClose={() => setProgressJob(null)}
          onComplete={handleProgressComplete}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          message={`"${confirmDelete}" 앱과 관련된 모든 데이터가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
          confirmLabel="영구 삭제"
          danger
          requiredInput={confirmDelete}
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
