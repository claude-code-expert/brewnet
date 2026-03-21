// features/domain/components/ZoneStep.tsx — Step 2: Zone (domain) selection

import { useState, useRef, useEffect } from 'react';
import { RotateCw, ChevronDown, Globe } from 'lucide-react';
import { HelpTooltip } from './HelpTooltip.js';
import type { CloudflareZone } from '../types.js';

interface ZoneStepProps {
  zones: CloudflareZone[];
  zonesLoading: boolean;
  zonesError: string | null;
  onLoadZones: () => Promise<void>;
  onSelectZone: (zoneId: string, token: string) => Promise<void>;
  /** Current token (needed to save zone + token together) */
  currentToken?: string;
  onHelp: (key: string) => void;
}

function ZoneDropdown({ zones, selectedId, onSelect }: {
  zones: CloudflareZone[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = zones.find((z) => z.id === selectedId);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: 'var(--bg3)',
          border: `1px solid ${open ? 'var(--amber)' : 'var(--bdr2)'}`,
          borderRadius: 'var(--r)',
          padding: '9px 13px',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          color: selected ? 'var(--txt)' : 'var(--txt3)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.14s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {selected && <Globe size={13} style={{ color: 'var(--teal)', flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.name : '— Select a domain —'}
          </span>
        </span>
        {selected && (
          <span style={{
            fontSize: 10,
            fontFamily: 'var(--sans)',
            padding: '2px 7px',
            borderRadius: 4,
            background: selected.status === 'active' ? 'rgba(61,232,154,0.1)' : 'rgba(232,168,73,0.1)',
            color: selected.status === 'active' ? 'var(--green)' : 'var(--amber)',
            flexShrink: 0,
          }}>
            {selected.status}
          </span>
        )}
        <ChevronDown
          size={14}
          style={{
            color: 'var(--txt2)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.14s',
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: 'var(--bg2)',
          border: '1px solid var(--bdr3)',
          borderRadius: 'var(--r)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {zones.map((zone) => {
            const isSelected = zone.id === selectedId;
            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => { onSelect(zone.id); setOpen(false); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '10px 13px',
                  background: isSelected ? 'rgba(61,214,200,0.07)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--bdr)',
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  color: isSelected ? 'var(--teal)' : 'var(--txt)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe size={13} style={{ color: isSelected ? 'var(--teal)' : 'var(--txt2)', flexShrink: 0 }} />
                  {zone.name}
                </span>
                <span style={{
                  fontSize: 10,
                  fontFamily: 'var(--sans)',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: zone.status === 'active' ? 'rgba(61,232,154,0.1)' : 'rgba(232,168,73,0.1)',
                  color: zone.status === 'active' ? 'var(--green)' : 'var(--amber)',
                  flexShrink: 0,
                }}>
                  {zone.status}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ZoneStep({
  zones,
  zonesLoading,
  zonesError,
  onLoadZones,
  onSelectZone,
  currentToken = '',
  onHelp,
}: ZoneStepProps) {
  const [selectedId, setSelectedId] = useState('');

  const handleSelect = (zoneId: string) => {
    setSelectedId(zoneId);
    if (zoneId) {
      void onSelectZone(zoneId, currentToken);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>
          Select Domain (Zone)
          <span style={{ marginLeft: 6 }}>
            <HelpTooltip helpKey="zone" onHelp={onHelp} />
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>
          Choose which domain to use for your Brewnet apps.
        </div>

        {zonesLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--txt2)', padding: '12px 0' }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
            Fetching your domains…
          </div>
        ) : zonesError ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--r)',
              background: 'rgba(240,180,50,0.07)',
              border: '1px solid rgba(240,180,50,0.25)',
              fontSize: 12,
              color: 'var(--amber)',
              lineHeight: 1.6,
            }}>
              {zonesError}
            </div>
            <button className="btn bg" onClick={() => void onLoadZones()} style={{ alignSelf: 'flex-start' }}>
              <RotateCw size={14} /> Retry
            </button>
          </div>
        ) : zones.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--txt2)', fontStyle: 'italic' }}>
              No domains found in your Cloudflare account.
            </div>
            <button className="btn bg" onClick={() => void onLoadZones()} style={{ alignSelf: 'flex-start' }}>
              <RotateCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <ZoneDropdown zones={zones} selectedId={selectedId} onSelect={handleSelect} />
        )}
      </div>
    </div>
  );
}
