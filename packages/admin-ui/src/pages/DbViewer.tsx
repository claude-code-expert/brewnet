import { useState, useEffect } from 'react';

interface DbDump {
  dbPath: string;
  tables: string[];
  data: Record<string, Record<string, unknown>[]>;
  _meta: {
    note: string;
    dbManaged: string[];
    legacyFiles: { path: string; purpose: string; risk: string }[];
  };
}

export function DbViewer() {
  const [dump, setDump] = useState<DbDump | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState<string | null>(null);

  const fetchDb = async () => {
    setLoading(true);
    setError(null);
    try {
      const pw = sessionStorage.getItem('adminPassword') ?? '';
      const res = await fetch('/api/debug/db', {
        headers: { 'X-Admin-Password': pw },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDump(data);
      if (data.tables?.length && !activeTable) setActiveTable(data.tables[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDb(); }, []);

  if (loading) return <div className="page-container"><p style={{ color: '#999', padding: 40, textAlign: 'center' }}>Loading DB...</p></div>;
  if (error) return <div className="page-container"><p style={{ color: '#f44', padding: 40 }}>Error: {error}</p></div>;
  if (!dump) return null;

  const rows = activeTable ? dump.data[activeTable] ?? [] : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#fff' }}>
          <span style={{ color: '#f5a623' }}>DB</span> Inspector
          <span style={{ fontSize: 12, color: '#666', marginLeft: 8, fontWeight: 400 }}>DEV ONLY</span>
        </h2>
        <button onClick={fetchDb} style={{
          background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 6,
          padding: '6px 14px', cursor: 'pointer', fontSize: 13,
        }}>Refresh</button>
      </div>

      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        {dump.dbPath}
      </p>

      {/* Table tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {dump.tables.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTable(t)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
              background: activeTable === t ? '#f5a623' : '#2a2a2a',
              color: activeTable === t ? '#000' : '#aaa',
            }}
          >
            {t}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
              ({(dump.data[t] ?? []).length})
            </span>
          </button>
        ))}
      </div>

      {/* Data table */}
      {rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#666', background: '#1a1a1a', borderRadius: 8 }}>
          Empty table
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #333' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col} style={{
                    textAlign: 'left', padding: '8px 12px', background: '#1e1e1e',
                    color: '#f5a623', borderBottom: '1px solid #333', whiteSpace: 'nowrap',
                    fontSize: 12, fontWeight: 600, letterSpacing: 0.3,
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#141414' : '#1a1a1a' }}>
                  {columns.map((col) => {
                    const val = row[col];
                    const display = val === null ? 'NULL' : String(val);
                    const isNull = val === null;
                    return (
                      <td key={col} style={{
                        padding: '6px 12px', borderBottom: '1px solid #222',
                        color: isNull ? '#555' : '#ccc', fontStyle: isNull ? 'italic' : 'normal',
                        whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis',
                        fontFamily: 'monospace', fontSize: 12,
                      }}>
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DB-managed data summary */}
      <div style={{ marginTop: 24, padding: 16, background: '#1a1a1a', borderRadius: 8, border: '1px solid #333' }}>
        <h3 style={{ margin: '0 0 8px', color: '#6b6', fontSize: 14 }}>DB-Managed (survives ~/.brewnet/ deletion)</h3>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#888' }}>{dump._meta.note}</p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#aaa' }}>
          {dump._meta.dbManaged.map((item, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{item}</li>
          ))}
        </ul>
      </div>

      {/* Legacy files */}
      <div style={{ marginTop: 12, padding: 16, background: '#1a1a1a', borderRadius: 8, border: '1px solid #333' }}>
        <h3 style={{ margin: '0 0 12px', color: '#888', fontSize: 14 }}>Legacy Files (not required for server boot)</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: '#666' }}>Path</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: '#666' }}>Purpose</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: '#666' }}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {dump._meta.legacyFiles.map((f, i) => (
              <tr key={i}>
                <td style={{ padding: '4px 8px', color: '#777', fontFamily: 'monospace' }}>{f.path}</td>
                <td style={{ padding: '4px 8px', color: '#999' }}>{f.purpose}</td>
                <td style={{ padding: '4px 8px', color: '#6b6' }}>{f.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
