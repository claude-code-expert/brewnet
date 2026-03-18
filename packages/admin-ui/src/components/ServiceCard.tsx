import type { ServiceStatus, ServiceDetail } from '../types.js';

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

      {detail?.description && (
        <p style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5, margin: 0 }}>
          {detail.description}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {service.port && (
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--mono)',
              color: 'var(--txt3)',
              background: 'var(--bg3)',
              border: '1px solid var(--bdr)',
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            :{service.port}
          </span>
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

      {isRunning && (service.cpu || service.memory) && (
        <div style={{ display: 'flex', gap: 12 }}>
          {service.cpu && (
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>
              CPU {service.cpu}
            </span>
          )}
          {service.memory && (
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>
              MEM {service.memory}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
