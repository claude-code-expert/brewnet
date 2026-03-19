// T032 — ProgressModal: polls job status and renders step list + logs
import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppJob } from '../types.js';

interface ProgressModalProps {
  jobId: string;
  appName: string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onComplete?: () => void;
}

function StepIcon({ status }: { status: AppJob['steps'][number]['status'] }) {
  if (status === 'done') {
    return <span style={{ color: 'var(--green)', fontWeight: 700, width: 16, display: 'inline-block', textAlign: 'center' }}>✓</span>;
  }
  if (status === 'running') {
    return (
      <span style={{
        color: 'var(--amber)',
        fontWeight: 700,
        width: 16,
        display: 'inline-block',
        textAlign: 'center',
        animation: 'spin 1s linear infinite',
      }}>◌</span>
    );
  }
  if (status === 'failed') {
    return <span style={{ color: 'var(--red)', fontWeight: 700, width: 16, display: 'inline-block', textAlign: 'center' }}>✗</span>;
  }
  // pending
  return <span style={{ color: 'var(--txt3)', width: 16, display: 'inline-block', textAlign: 'center' }}>○</span>;
}

export function ProgressModal({ jobId, appName, apiFetch, onClose, onComplete }: ProgressModalProps) {
  const [job, setJob] = useState<AppJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/apps/jobs/${jobId}`);
      if (!res.ok) {
        setError(`Failed to fetch job status: ${res.status}`);
        return false;
      }
      const data = await res.json() as AppJob;
      setJob(data);
      if (data.status === 'done' && !doneRef.current) {
        doneRef.current = true;
        onComplete?.();
        return false; // stop polling
      }
      if (data.status === 'failed') {
        return false; // stop polling
      }
      return true; // continue polling
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [jobId, apiFetch, onComplete]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const run = async () => {
      const keepGoing = await poll();
      if (keepGoing && !cancelled) {
        intervalId = setInterval(async () => {
          const cont = await poll();
          if (!cont && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }, 1000);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [job?.logs]);

  const logs = job?.logs?.slice(-50) ?? [];

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 580 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--bdr)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>
              {job?.status === 'done'
                ? '✓ App Created'
                : job?.status === 'failed'
                  ? '✗ Creation Failed'
                  : 'Creating App…'}
            </div>
            <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt3)', marginTop: 3 }}>
              {appName} — job {jobId.slice(0, 8)}
            </div>
          </div>
          <button className="xbtn" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Steps */}
          {job && job.steps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {job.steps.map((s, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 'var(--r)',
                  background: s.status === 'running'
                    ? 'rgba(232,168,73,0.06)'
                    : s.status === 'done'
                      ? 'rgba(61,232,154,0.04)'
                      : s.status === 'failed'
                        ? 'rgba(240,75,90,0.06)'
                        : 'transparent',
                  border: s.status === 'running'
                    ? '1px solid rgba(232,168,73,0.15)'
                    : '1px solid transparent',
                }}>
                  <StepIcon status={s.status} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 13,
                      color: s.status === 'done' ? 'var(--txt2)'
                           : s.status === 'running' ? 'var(--amber)'
                           : s.status === 'failed'  ? 'var(--red)'
                           : 'var(--txt3)',
                    }}>
                      {s.label}
                    </div>
                    {s.message && (
                      <div style={{ fontSize: 11.5, color: 'var(--txt3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        {s.message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {(job?.status === 'failed' || error) && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--r)',
              background: 'rgba(240,75,90,0.07)',
              border: '1px solid rgba(240,75,90,0.2)',
              color: 'var(--red)',
              fontSize: 12.5,
              fontFamily: 'var(--mono)',
            }}>
              {job?.error ?? error ?? 'Job failed. Check server logs.'}
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Logs</div>
              <div style={{
                background: 'var(--bg0)',
                border: '1px solid var(--bdr)',
                borderRadius: 'var(--r)',
                padding: '10px 12px',
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                color: 'var(--txt2)',
                maxHeight: 200,
                overflowY: 'auto',
                lineHeight: 1.7,
              }}>
                {logs.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* Loading state */}
          {!job && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--txt2)', fontSize: 13 }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
              Waiting for job…
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px 20px',
          borderTop: '1px solid var(--bdr)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button className="btn bg" onClick={onClose}>
            {job?.status === 'done' ? 'Close' : job?.status === 'failed' ? 'Dismiss' : 'Close (keep running)'}
          </button>
        </div>
      </div>
    </div>
  );
}
