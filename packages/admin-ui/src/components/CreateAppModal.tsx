// T031 — CreateAppModal: multi-step wizard for app creation
import { useState } from 'react';
import type { AppEntry } from '../types.js';
import { showToast } from './Toast.js';

// CreateAppOptions mirrors what admin-server expects
interface CreateAppOptions {
  name: string;
  mode: AppEntry['mode'];
  stackId?: string;
  lang?: string;
  framework?: string;
  port: number;
  sourceUrl?: string;
}

interface CreateAppModalProps {
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onCreated: (jobId: string, appName: string) => void;
  onClose: () => void;
}

const BOILERPLATE_STACKS = [
  { id: 'nodejs-express',  label: 'Node.js / Express',   lang: 'nodejs',  framework: 'express' },
  { id: 'nodejs-nextjs',   label: 'Node.js / Next.js',   lang: 'nodejs',  framework: 'nextjs' },
  { id: 'python-fastapi',  label: 'Python / FastAPI',     lang: 'python',  framework: 'fastapi' },
  { id: 'golang-gin',      label: 'Go / Gin',             lang: 'golang',  framework: 'gin' },
  { id: 'rust-actix',      label: 'Rust / Actix',         lang: 'rust',    framework: 'actix' },
];

const LANGUAGES = ['nodejs', 'python', 'golang', 'rust', 'java', 'ruby'];
const FRAMEWORKS: Record<string, string[]> = {
  nodejs:  ['express', 'nextjs', 'fastify', 'koa'],
  python:  ['fastapi', 'flask', 'django'],
  golang:  ['gin', 'echo', 'fiber'],
  rust:    ['actix', 'axum'],
  java:    ['spring', 'quarkus'],
  ruby:    ['rails', 'sinatra'],
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
  const [framework, setFramework] = useState('');
  const [port, setPort]         = useState(3000);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError]   = useState('');

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
    if (mode === 'boilerplate' && !stackId) {
      showToast('Select a stack to continue');
      return;
    }
    if (mode === 'new-project' && !lang) {
      showToast('Select a language to continue');
      return;
    }
    setStep(3);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body: CreateAppOptions = {
        name: appName.trim(),
        mode,
        port,
        ...(mode === 'boilerplate' ? { stackId } : {}),
        ...(mode === 'new-project'  ? { lang, framework } : {}),
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

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520 }}>
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
        <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>

          {/* Step 1: Name + mode */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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

              <div>
                <label className="fl">Mode</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['boilerplate', 'new-project'] as AppEntry['mode'][]).map((m) => (
                    <button
                      key={m}
                      style={{
                        ...chipStyle(mode === m),
                        padding: '10px 20px',
                        borderRadius: 'var(--r)',
                        fontSize: 13,
                      }}
                      onClick={() => setMode(m)}
                    >
                      {m === 'boilerplate' ? '📦 Boilerplate' : '🔧 New Project'}
                    </button>
                  ))}
                </div>
                <div className="fhint" style={{ marginTop: 8 }}>
                  {mode === 'boilerplate'
                    ? 'Clone a ready-to-run template stack from Brewnet boilerplates.'
                    : 'Start from scratch with a language and framework of your choice.'}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Stack / language selection */}
          {step === 2 && mode === 'boilerplate' && (
            <div>
              <label className="fl">Select Stack</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {BOILERPLATE_STACKS.map((s) => (
                  <button
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 'var(--r)',
                      border: stackId === s.id ? '1px solid var(--amber)' : '1px solid var(--bdr2)',
                      background: stackId === s.id ? 'rgba(232,168,73,0.08)' : 'var(--bg3)',
                      cursor: 'pointer',
                      transition: 'all 0.14s',
                      width: '100%',
                      textAlign: 'left' as const,
                    }}
                    onClick={() => setStackId(s.id)}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: stackId === s.id ? 'var(--amber)' : 'var(--txt)' }}>
                      {s.label}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt3)', marginLeft: 'auto' }}>
                      {s.id}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && mode === 'new-project' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label className="fl">Language</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l}
                      style={chipStyle(lang === l)}
                      onClick={() => { setLang(l); setFramework(''); }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {lang && (
                <div>
                  <label className="fl">Framework</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(FRAMEWORKS[lang] ?? []).map((f) => (
                      <button
                        key={f}
                        style={chipStyle(framework === f)}
                        onClick={() => setFramework(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
              />
              <div className="fhint">Container port your app listens on. Default 3000.</div>
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
