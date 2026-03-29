// T031 — CreateAppModal: multi-step wizard for app creation
import { useState, useEffect, useRef } from 'react';
import { Package, GitBranch } from 'lucide-react';
import type { AppEntry } from '../types.js';
import { showToast } from './Toast.js';

// CreateAppOptions mirrors what admin-server expects (packages/cli/src/types/app-entry.ts)
interface CreateAppOptions {
  appName: string;
  mode: AppEntry['mode'];
  stackId?: string;
  language?: string;
  frameworkId?: string;
  port: number;
  gitUrl?: string;
}

interface CreateAppModalProps {
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onCreated: (jobId: string, appName: string) => void;
  onClose: () => void;
}

// Language options for boilerplate mode — must match config/frameworks.ts resolveStackId()
const LANG_OPTIONS = [
  { id: 'nodejs',  label: 'Node.js' },
  { id: 'python',  label: 'Python'  },
  { id: 'go',      label: 'Go'      },
  { id: 'rust',    label: 'Rust'    },
  { id: 'java',    label: 'Java'    },
  { id: 'kotlin',  label: 'Kotlin'  },
];

const FRAMEWORK_OPTIONS: Record<string, { id: string; label: string; stackId: string }[]> = {
  nodejs:  [
    { id: 'express',    label: 'Express 5',                stackId: 'nodejs-express'      },
    { id: 'nestjs',     label: 'NestJS 11',                stackId: 'nodejs-nestjs'       },
    { id: 'nextjs-app', label: 'Next.js 15 (API Routes)',  stackId: 'nodejs-nextjs'       },
    { id: 'nextjs',     label: 'Next.js 15 (Full-Stack)',  stackId: 'nodejs-nextjs-full'  },
  ],
  python:  [
    { id: 'fastapi', label: 'FastAPI',           stackId: 'python-fastapi' },
    { id: 'django',  label: 'Django 6',          stackId: 'python-django'  },
    { id: 'flask',   label: 'Flask 3.1',         stackId: 'python-flask'   },
  ],
  go:      [
    { id: 'gin',   label: 'Gin',     stackId: 'go-gin'   },
    { id: 'echo',  label: 'Echo v4', stackId: 'go-echo'  },
    { id: 'fiber', label: 'Fiber v3',stackId: 'go-fiber' },
  ],
  rust:    [
    { id: 'actix-web', label: 'Actix-web 4', stackId: 'rust-actix-web' },
    { id: 'axum',      label: 'Axum 0.8',    stackId: 'rust-axum'      },
  ],
  java:    [
    { id: 'springboot', label: 'Spring Boot 3.3',      stackId: 'java-springboot' },
    { id: 'spring',     label: 'Spring Framework 6.2', stackId: 'java-spring'     },
  ],
  kotlin:  [
    { id: 'ktor',          label: 'Ktor 3.1',       stackId: 'kotlin-ktor'       },
    { id: 'springboot-kt', label: 'Spring Boot 3.4', stackId: 'kotlin-springboot' },
  ],
};

function chipStyle(selected: boolean) {
  return {
    padding: '7px 16px',
    borderRadius: 20,
    border: selected ? '1px solid var(--amber)' : '1px solid var(--bdr2)',
    background: selected ? 'rgba(232,168,73,0.12)' : 'var(--bg3)',
    color: selected ? 'var(--amber)' : 'var(--txt2)',
    fontSize: 12,
    fontFamily: 'var(--mono)',
    cursor: 'pointer',
    transition: 'all 0.14s',
    userSelect: 'none' as const,
  };
}

export function CreateAppModal({ apiFetch, onCreated, onClose }: CreateAppModalProps) {
  const [step, setStep] = useState(1);
  const [appName, setAppName]   = useState('');
  const [mode, setMode]         = useState<AppEntry['mode']>('boilerplate');
  const [stackId, setStackId]   = useState('');
  const [lang, setLang]         = useState('');
  const [frameworkId, setFrameworkId] = useState('');
  const [gitUrl, setGitUrl]     = useState('');
  const [port, setPort]         = useState(3000);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError]   = useState('');
  const [portStatus, setPortStatus] = useState<'idle' | 'checking' | 'available' | 'conflict'>('idle');
  const [suggestedPort, setSuggestedPort] = useState<number | null>(null);
  const portCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced port conflict check — runs when port value changes on step 3
  useEffect(() => {
    if (step !== 3) return;
    setPortStatus('checking');
    setSuggestedPort(null);
    if (portCheckTimer.current) clearTimeout(portCheckTimer.current);
    portCheckTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/apps/check-port?port=${port}`);
        if (!res.ok) { setPortStatus('idle'); return; }
        const data = await res.json() as { available: boolean };
        if (data.available) {
          setPortStatus('available');
        } else {
          // Find next available port starting from port+1
          let candidate = port + 1;
          while (candidate <= 65535) {
            const r = await apiFetch(`/api/apps/check-port?port=${candidate}`);
            if (r.ok) {
              const d = await r.json() as { available: boolean };
              if (d.available) break;
            }
            candidate++;
          }
          setSuggestedPort(candidate <= 65535 ? candidate : null);
          setPortStatus('conflict');
        }
      } catch {
        setPortStatus('idle');
      }
    }, 400);
    return () => { if (portCheckTimer.current) clearTimeout(portCheckTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, step]);

  // Step 1 → 2
  const goNext1 = () => {
    const trimmed = appName.trim();
    if (!trimmed) { setNameError('App name is required'); return; }
    if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(trimmed)) {
      setNameError('Lowercase letters, numbers and hyphens only, max 30 chars');
      return;
    }
    setNameError('');
    setStep(2);
  };

  // Step 2 → 3
  const goNext2 = () => {
    if (mode === 'boilerplate') {
      if (!stackId) { showToast('Select a stack to continue'); return; }
    } else if (mode === 'git-clone') {
      const trimmedUrl = gitUrl.trim();
      if (!trimmedUrl) { showToast('Git URL is required'); return; }
      if (!/^https?:\/\/.+/.test(trimmedUrl)) { showToast('Enter a valid Git URL (https://)'); return; }
    }
    setStep(3);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body: CreateAppOptions = {
        appName: appName.trim(),
        mode,
        port,
        ...(mode === 'boilerplate' ? { stackId } : {}),
        ...(mode === 'git-clone'   ? { gitUrl: gitUrl.trim() } : {}),
      };
      const res = await apiFetch('/api/apps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        showToast(`Error: ${err.error ?? res.statusText}`);
        return;
      }
      const data = await res.json() as { jobId: string };
      onCreated(data.jobId, appName.trim());
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const stackRowStyle = (selected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 'var(--r)',
    border: selected ? '1px solid var(--amber)' : '1px solid var(--bdr2)',
    background: selected ? 'rgba(232,168,73,0.08)' : 'var(--bg3)',
    cursor: 'pointer' as const,
    transition: 'all 0.14s',
    width: '100%',
    textAlign: 'left' as const,
  });

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 0',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)' }}>Create New App</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
              Step {step} of 3
            </div>
          </div>
          <button className="xbtn" onClick={onClose}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '12px 24px 0' }}>
          <div style={{ height: 3, background: 'var(--bdr)', borderRadius: 4 }}>
            <div style={{
              height: '100%',
              width: `${(step / 3) * 100}%`,
              background: 'var(--amber)',
              borderRadius: 4,
              transition: 'width 0.2s ease',
            }} />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', maxHeight: '60vh' }}>

          {/* Step 1: Mode + name */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label className="fl">Mode</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { id: 'boilerplate', label: 'Boilerplate', Icon: Package },
                    { id: 'git-clone',   label: 'Git Clone',   Icon: GitBranch },
                  ] as { id: AppEntry['mode']; label: string; Icon: typeof Package }[]).map(({ id, label, Icon }) => {
                    const sel = mode === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setMode(id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '9px 18px',
                          borderRadius: 'var(--r)',
                          border: sel ? '1px solid var(--amber)' : '1px solid var(--bdr2)',
                          background: sel ? 'rgba(232,168,73,0.1)' : 'var(--bg3)',
                          color: sel ? 'var(--amber)' : 'var(--txt2)',
                          fontSize: 13, fontWeight: sel ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.14s',
                        }}
                      >
                        <Icon size={15} strokeWidth={sel ? 2.2 : 1.8} />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="fhint" style={{ marginTop: 8 }}>
                  {mode === 'boilerplate'
                    ? 'Clone a Brewnet catalog template (language + framework).'
                    : mode === 'git-clone'
                    ? 'Clone any Git repository and deploy it on brewnet.'
                    : 'Deploy an existing local project by path (auto-detects language).'}
                </div>
              </div>

              <div className="fg">
                <label className="fl">App Name</label>
                <input
                  className="fi"
                  value={appName}
                  onChange={(e) => { setAppName(e.target.value); setNameError(''); }}
                  placeholder="my-app"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') goNext1(); }}
                />
                {nameError && <div className="fhint" style={{ color: 'var(--red)' }}>{nameError}</div>}
                <div className="fhint">Lowercase letters, numbers, hyphens. Max 30 chars.</div>
              </div>
            </div>
          )}

          {/* Step 2a: Boilerplate — language + framework picker */}
          {step === 2 && mode === 'boilerplate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label className="fl">Language</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LANG_OPTIONS.map((l) => (
                    <button
                      key={l.id}
                      style={chipStyle(lang === l.id)}
                      onClick={() => { setLang(l.id); setFrameworkId(''); setStackId(''); }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {lang && (
                <div>
                  <label className="fl">Framework</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(FRAMEWORK_OPTIONS[lang] ?? []).map((f) => (
                      <button
                        key={f.id}
                        style={stackRowStyle(frameworkId === f.id)}
                        onClick={() => { setFrameworkId(f.id); setStackId(f.stackId); }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: frameworkId === f.id ? 'var(--amber)' : 'var(--txt)' }}>
                          {f.label}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt3)', marginLeft: 'auto' }}>
                          {f.stackId}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2b: Git Clone — repository URL input */}
          {step === 2 && mode === 'git-clone' && (
            <div className="fg">
              <label className="fl">Git Repository URL</label>
              <input
                className="fi"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/your-org/your-repo.git"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') goNext2(); }}
              />
              <div className="fhint">Clone and deploy any public or private Git repository.</div>
            </div>
          )}


          {/* Step 3: Port */}
          {step === 3 && (
            <div className="fg">
              <label className="fl">Port</label>
              <input
                className="fi"
                type="number"
                min={1024}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                autoFocus
                style={{ borderColor: portStatus === 'conflict' ? 'var(--red)' : undefined }}
              />
              {portStatus === 'checking' && (
                <div className="fhint">포트 확인 중…</div>
              )}
              {portStatus === 'conflict' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <div className="fhint" style={{ color: 'var(--red)', margin: 0 }}>
                    ⚠ 포트 {port} 사용 중.
                  </div>
                  {suggestedPort && (
                    <button
                      className="btn bg bsm"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={() => setPort(suggestedPort)}
                    >
                      {suggestedPort} 사용
                    </button>
                  )}
                </div>
              )}
              {portStatus === 'available' && (
                <div className="fhint">Container port your app listens on. Default 3000.</div>
              )}
              {(mode === 'boilerplate' && lang === 'rust') && (
                <div className="fhint" style={{ color: 'var(--amber)', marginTop: 6 }}>
                  ⚠ Rust stacks require longer build time (~10–20 min).
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 24px 20px',
          gap: 10,
        }}>
          <button
            className="btn bg"
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step < 3 && (
              <button
                className="btn bp"
                onClick={step === 1 ? goNext1 : goNext2}
                disabled={step === 2 && (
                  mode === 'boilerplate' ? !frameworkId :
                  mode === 'git-clone'   ? !gitUrl.trim() :
                  false
                )}
              >
                Next →
              </button>
            )}
            {step === 3 && (
              <button
                className="btn bp"
                onClick={handleSubmit}
                disabled={submitting}
                style={{ opacity: submitting ? 0.6 : 1 }}
              >
                {submitting
                  ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span> Creating…</>
                  : 'Create App'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
