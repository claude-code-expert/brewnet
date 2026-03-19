import { useState } from 'react';
import type { BoilerplateMeta } from '../types.js';
import { BoilerplateDetailModal } from './BoilerplateDetailModal.js';

interface BoilerplateSectionProps {
  stacks: BoilerplateMeta[];
}

export function BoilerplateSection({ stacks }: BoilerplateSectionProps) {
  const [selected, setSelected] = useState<BoilerplateMeta | null>(null);

  if (stacks.length === 0) return null;

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 10 }}>Boilerplate Stacks</div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {stacks.map((stack) => (
          <div
            key={stack.stackId}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--bdr)',
              borderRadius: 'var(--r2)',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'border-color 0.14s',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
            onClick={() => setSelected(stack)}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--bdr3)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--bdr)')}
          >
            {/* Stack ID + status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'var(--mono)',
                  color: 'var(--txt)',
                }}
              >
                {stack.stackId}
              </span>
              {stack.status && (
                <span
                  className={
                    stack.status === 'running' ? 'bdg b-run'
                      : stack.status === 'stopped' ? 'bdg b-stop'
                      : 'bdg b-build'
                  }
                  style={{ fontSize: 10 }}
                >
                  {stack.status === 'running' && <span className="blink-dot" />}
                  {stack.status}
                </span>
              )}
            </div>

            {/* Lang / Framework chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {stack.lang && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: 'var(--mono)',
                    color: 'var(--teal)',
                    background: 'rgba(61,214,200,0.07)',
                    border: '1px solid rgba(61,214,200,0.15)',
                    borderRadius: 4,
                    padding: '2px 7px',
                  }}
                >
                  {stack.lang}
                </span>
              )}
              {stack.frameworkId && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: 'var(--mono)',
                    color: 'var(--violet)',
                    background: 'rgba(167,139,250,0.07)',
                    border: '1px solid rgba(167,139,250,0.15)',
                    borderRadius: 4,
                    padding: '2px 7px',
                  }}
                >
                  {stack.frameworkId}
                </span>
              )}
              {stack.isUnified && (
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--mono)',
                    color: 'var(--amber)',
                    background: 'rgba(232,168,73,0.07)',
                    border: '1px solid rgba(232,168,73,0.15)',
                    borderRadius: 4,
                    padding: '2px 7px',
                  }}
                >
                  Unified
                </span>
              )}
            </div>

            {/* URL links */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {stack.backendUrl && (
                <a
                  href={stack.backendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="domain-link"
                  style={{ fontSize: 10.5 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗ {stack.isUnified ? 'App' : 'Backend'}
                </a>
              )}
              {stack.frontendUrl && !stack.isUnified && (
                <a
                  href={stack.frontendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="domain-link"
                  style={{
                    fontSize: 10.5,
                    background: 'rgba(232,168,73,0.07)',
                    borderColor: 'rgba(232,168,73,0.18)',
                    color: 'var(--amber)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗ Frontend
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <BoilerplateDetailModal stack={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
