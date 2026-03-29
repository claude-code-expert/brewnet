import { useState } from 'react';
import type { ServiceStatus, ServiceDetail } from '../types.js';

const STACK_LABELS: Record<string, string> = {
  'go-gin':             'Go / Gin',
  'go-echo':            'Go / Echo',
  'go-fiber':           'Go / Fiber',
  'rust-actix-web':     'Rust / Actix',
  'rust-axum':          'Rust / Axum',
  'java-springboot':    'Java / Spring Boot',
  'java-spring':        'Java / Spring',
  'kotlin-ktor':        'Kotlin / Ktor',
  'kotlin-springboot':  'Kotlin / Spring Boot',
  'nodejs-express':     'Node.js / Express',
  'nodejs-nestjs':      'Node.js / NestJS',
  'nodejs-nextjs':      'Node.js / Next.js',
  'nodejs-nextjs-full': 'Node.js / Next.js Full',
  'python-fastapi':     'Python / FastAPI',
  'python-django':      'Python / Django',
  'python-flask':       'Python / Flask',
};

interface ServiceCardProps {
  service: ServiceStatus;
  detail?: ServiceDetail;
  onOpenDetail: () => void;
}

function statusBadgeClass(status: ServiceStatus['status']): string {
  switch (status) {
    case 'running': return 'bdg b-run';
    case 'stopped': return 'bdg b-stop';
    case 'error': return 'bdg b-stop';
    case 'not_installed': return 'bdg b-idle';
    default: return 'bdg b-idle';
  }
}

function statusLabel(status: ServiceStatus['status']): string {
  switch (status) {
    case 'running': return 'Running';
    case 'stopped': return 'Stopped';
    case 'error': return 'Error';
    case 'not_installed': return 'Not Installed';
    default: return status;
  }
}

export function CopyButton({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch((err: unknown) => {
      console.warn('[CopyButton] clipboard write failed:', err);
    });
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '2px 8px',
        fontSize: 10,
        fontFamily: 'var(--mono)',
        background: copied ? 'rgba(61,214,200,0.12)' : 'var(--bg3)',
        border: `1px solid ${copied ? 'rgba(61,214,200,0.4)' : 'var(--bdr2)'}`,
        borderRadius: 20,
        color: copied ? 'var(--teal)' : 'var(--txt2)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        lineHeight: 1.6,
        flexShrink: 0,
        ...style,
      }}
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

export function ServiceCard({ service, detail, onOpenDetail }: ServiceCardProps) {
  const isRunning = service.status === 'running';

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bdr)',
        borderRadius: 'var(--r2)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'pointer',
        transition: 'border-color 0.14s',
      }}
      onClick={onOpenDetail}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--bdr3)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--bdr)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--txt)',
            fontFamily: 'var(--mono)',
          }}
        >
          {service.name}
        </span>
        <span className={statusBadgeClass(service.status)}>
          {isRunning && <span className="blink-dot" />}
          {statusLabel(service.status)}
        </span>
      </div>

      {service.stackId && (
        <span style={{
          fontSize: 11,
          fontFamily: 'var(--mono)',
          color: 'var(--teal)',
          background: 'rgba(61,214,200,0.07)',
          border: '1px solid rgba(61,214,200,0.18)',
          borderRadius: 20,
          padding: '2px 9px',
          alignSelf: 'flex-start',
        }}>
          {STACK_LABELS[service.stackId] ?? service.stackId}
        </span>
      )}

      {detail?.description && (
        <p style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5, margin: 0 }}>
          {detail.description}
        </p>
      )}

      {service.port && (
        <span
          style={{
            fontSize: 11,
            fontFamily: 'var(--mono)',
            color: 'var(--txt2)',
            background: 'var(--bg3)',
            border: '1px solid var(--bdr2)',
            borderRadius: 4,
            padding: '2px 7px',
            alignSelf: 'flex-start',
          }}
        >
          :{service.port}
        </span>
      )}


      {!service.url && !service.externalUrl && detail?.credentials?.command && (
        <div
          style={{
            background: '#0a1020',
            border: '1px solid var(--bdr)',
            borderRadius: 4,
            padding: '5px 10px',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--teal)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={detail.credentials.command}
        >
          {detail.credentials.command}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
        {!service.url && !service.externalUrl && detail?.credentials?.command && (
          <CopyButton text={detail.credentials.command} />
        )}
        {service.url && (
          <a
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="domain-link"
            style={{ fontSize: 11 }}
            onClick={(e) => e.stopPropagation()}
          >
            ↗ Local
          </a>
        )}

        {service.backendApiUrl && (
          <a
            href={service.backendApiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="domain-link"
            style={{ fontSize: 11 }}
            onClick={(e) => e.stopPropagation()}
          >
            ↗ API
          </a>
        )}

        {service.externalUrl && (
          <a
            href={service.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="domain-link"
            style={{
              fontSize: 11,
              background: 'rgba(232, 168, 73, 0.07)',
              borderColor: 'rgba(232, 168, 73, 0.18)',
              color: 'var(--amber)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            ↗ External
          </a>
        )}
      </div>
    </div>
  );
}
