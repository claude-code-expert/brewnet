import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth-context.js';
import { NavHeader } from '../components/NavHeader.js';
import { Footer } from '../components/Footer.js';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  image: string;
  ramEstimateMB: number;
  installed: boolean;
}

interface CatalogResponse {
  catalog: CatalogItem[];
}

const CATEGORY_ORDER = ['db', 'file', 'media', 'admin', 'other'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  db: 'Database',
  file: 'File Server',
  media: 'Media',
  admin: 'Admin',
  other: 'Other',
};

export function Catalog() {
  const { apiFetch } = useAuth();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await apiFetch('/api/catalog');
      if (res.ok) {
        const data = (await res.json()) as CatalogResponse;
        setCatalog(data.catalog ?? []);
      }
    } catch (err) {
      console.warn('[Catalog] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const handleInstall = async (id: string) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await apiFetch('/api/services/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetchCatalog();
    } catch (err) {
      console.warn('[Catalog] install error:', err);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRemove = async (id: string) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await apiFetch(`/api/services/containers/${id}`, { method: 'DELETE' });
      await fetchCatalog();
    } catch (err) {
      console.warn('[Catalog] remove error:', err);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Group by category
  const grouped = new Map<string, CatalogItem[]>();
  for (const item of catalog) {
    const cat = item.category || 'other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  // Sort categories by defined order
  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a as typeof CATEGORY_ORDER[number]);
    const bi = CATEGORY_ORDER.indexOf(b as typeof CATEGORY_ORDER[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div id="main">
      <NavHeader />

      <div id="content">
        <div className="section-title" style={{ marginBottom: 20, fontSize: 15, fontWeight: 700 }}>
          Service Catalog
        </div>

        {loading && (
          <div
            style={{
              color: 'var(--txt2)',
              padding: '40px 0',
              textAlign: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 13,
            }}
          >
            Loading catalog…
          </div>
        )}

        {!loading && catalog.length === 0 && (
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
            No services available
          </div>
        )}

        {!loading &&
          sortedCategories.map((cat) => (
            <div key={cat} style={{ marginBottom: 28 }}>
              <div
                className="section-title"
                style={{ marginBottom: 10, fontSize: 13 }}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {grouped.get(cat)!.map((item) => {
                  const busy = busyIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      style={{
                        background: 'var(--bg2)',
                        border: '1px solid var(--bdr2)',
                        borderRadius: 'var(--r2)',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt)' }}>
                          {item.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: 'var(--mono)',
                            color: item.installed ? 'var(--green)' : 'var(--txt2)',
                            background: item.installed ? 'rgba(74,222,128,0.07)' : 'rgba(255,255,255,0.03)',
                            border: item.installed ? '1px solid rgba(74,222,128,0.18)' : '1px solid var(--bdr3)',
                            borderRadius: 20,
                            padding: '2px 9px',
                          }}
                        >
                          {item.installed ? 'Installed' : 'Not installed'}
                        </span>
                      </div>

                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 12,
                          color: 'var(--txt2)',
                          wordBreak: 'break-all',
                        }}
                      >
                        {item.image}
                      </div>

                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 12,
                          color: 'var(--txt2)',
                        }}
                      >
                        RAM: ~{item.ramEstimateMB} MB
                      </div>

                      <div style={{ marginTop: 4 }}>
                        {item.installed ? (
                          <button
                            className={`btn bsm ${busy ? 'bg' : 'bp'}`}
                            disabled={busy}
                            onClick={() => void handleRemove(item.id)}
                            style={{ color: busy ? undefined : 'var(--red)' }}
                          >
                            {busy ? 'Removing...' : 'Remove'}
                          </button>
                        ) : (
                          <button
                            className={`btn bsm ${busy ? 'bg' : 'bp'}`}
                            disabled={busy}
                            onClick={() => void handleInstall(item.id)}
                          >
                            {busy ? 'Installing...' : 'Install'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      <Footer />
    </div>
  );
}
