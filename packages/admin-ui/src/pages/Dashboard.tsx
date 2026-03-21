import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth-context.js';
import { usePolling } from '../hooks/usePolling.js';
import { NavHeader } from '../components/NavHeader.js';
import { ServiceCard } from '../components/ServiceCard.js';
import { ServiceDetailModal } from '../components/ServiceDetailModal.js';
import { LogsTab } from '../components/LogsTab.js';
import type { ServiceStatus, ServiceDetail, ConfigResponse } from '../types.js';

type Tab = 'services' | 'logs';

interface ServicesResponse {
  services: ServiceStatus[];
}

interface CatalogResponse {
  catalog: Record<string, ServiceDetail>;
  aliases: Record<string, string>;
}

export function Dashboard() {
  const { apiFetch } = useAuth();
  const [tab, setTab] = useState<Tab>('services');

  const [quickTunnelUrl, setQuickTunnelUrl] = useState('');
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [catalog, setCatalog] = useState<Record<string, ServiceDetail>>({});
  const [selectedService, setSelectedService] = useState<ServiceStatus | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Initial data load
  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      try {
        const [configRes, svcRes, catalogRes] = await Promise.allSettled([
          apiFetch('/api/config'),
          apiFetch('/api/services'),
          apiFetch('/api/services/catalog'),
        ]);

        if (cancelled) return;

        if (configRes.status === 'fulfilled' && configRes.value.ok) {
          const d = await configRes.value.json() as ConfigResponse;
          if (!cancelled) setQuickTunnelUrl(d.quickTunnelUrl ?? '');
        }

        if (svcRes.status === 'fulfilled' && svcRes.value.ok) {
          const d = await svcRes.value.json() as ServicesResponse;
          if (!cancelled) setServices(d.services ?? []);
        }

        if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
          const d = await catalogRes.value.json() as CatalogResponse;
          if (!cancelled) setCatalog(d.catalog ?? {});
        }
      } catch (err) {
        console.warn('[Dashboard] initial load error:', err);
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    };

    void loadAll();
    return () => { cancelled = true; };
  }, [apiFetch]);

  // Polling for services every 5s
  const handleServicePoll = useCallback((data: unknown) => {
    const d = data as ServicesResponse;
    if (d?.services) setServices(d.services);
  }, []);

  usePolling('/api/services', 5000, apiFetch, handleServicePoll, !loadingInitial);

  const runningCount = services.filter((s) => s.status === 'running').length;
  const stoppedCount = services.filter((s) => s.status === 'stopped' || s.status === 'error').length;

  return (
    <div id="main">
      <NavHeader />

      <div id="content">
        {/* Quick Tunnel URL banner */}
        {quickTunnelUrl && (
          <div
            className="a-info"
            style={{
              borderRadius: 'var(--r)',
              padding: '10px 14px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
            }}
          >
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 10 }}>QUICK TUNNEL</span>
            <a
              href={quickTunnelUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', textDecoration: 'underline' }}
            >
              {quickTunnelUrl}
            </a>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {(['services', 'logs'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`btn bsm ${tab === t ? 'bp' : 'bg'}`}
              onClick={() => setTab(t)}
              style={{ textTransform: 'capitalize' }}
            >
              {t === 'services' ? 'Services' : 'Logs'}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loadingInitial && (
          <div style={{ color: 'var(--txt2)', padding: '40px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 13 }}>
            Loading dashboard…
          </div>
        )}

        {/* Services tab */}
        {!loadingInitial && tab === 'services' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Stat boxes */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="sbox" style={{ minWidth: 110 }}>
                <div className="sk">Total</div>
                <div className="sv">{services.length}</div>
              </div>
              <div className="sbox" style={{ minWidth: 110 }}>
                <div className="sk">Running</div>
                <div className="sv" style={{ color: 'var(--green)' }}>{runningCount}</div>
              </div>
              <div className="sbox" style={{ minWidth: 110 }}>
                <div className="sk">Stopped</div>
                <div className="sv" style={{ color: stoppedCount > 0 ? 'var(--red)' : 'var(--txt3)' }}>
                  {stoppedCount}
                </div>
              </div>
            </div>

            {/* Service cards grid */}
            {services.length > 0 ? (
              <div>
                <div className="section-title" style={{ marginBottom: 10 }}>Services</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 12,
                  }}
                >
                  {services.map((svc) => {
                    const detail = catalog[svc.id] ?? catalog[svc.name] ?? catalog[svc.type];
                    return (
                      <ServiceCard
                        key={svc.id}
                        service={svc}
                        detail={detail}
                        onOpenDetail={() => setSelectedService(svc)}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'var(--bg2)',
                  border: '1px dashed var(--bdr2)',
                  borderRadius: 'var(--r2)',
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--txt3)',
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                }}
              >
                No services found
              </div>
            )}
          </div>
        )}

        {/* Logs tab */}
        {!loadingInitial && tab === 'logs' && (
          <LogsTab apiFetch={apiFetch} />
        )}

        {/* Footer */}
        <div style={{
          height: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: '#0c1525',
          borderTop: '1px solid var(--bdr)',
          marginTop: 32,
          fontSize: 12.5,
          color: 'var(--txt3)',
        }}>
          <a
            href="https://github.com/claude-code-expert/brewnet"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--txt2)', textDecoration: 'none', fontFamily: 'var(--mono)', fontWeight: 600 }}
          >
            https://github.com/claude-code-expert/brewnet
          </a>
          <span>—</span>
          <span>If you like it, a star would mean a lot!</span>
        </div>
      </div>

      {/* Service detail modal */}
      {selectedService && (
        <ServiceDetailModal
          service={selectedService}
          detail={catalog[selectedService.id] ?? catalog[selectedService.name] ?? catalog[selectedService.type]}
          onClose={() => setSelectedService(null)}
        />
      )}
    </div>
  );
}
