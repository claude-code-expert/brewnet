import { useEffect, useRef, useCallback } from 'react';

let _show: ((msg: string) => void) | null = null;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearHideTimer() {
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
}

/** Imperative API — call from anywhere. Auto-hides after `ms`. */
export function showToast(msg: string, ms = 3000): void {
  clearHideTimer();
  _show?.(msg);
  _hideTimer = setTimeout(() => _show?.(''), ms);
}

/** Show a toast that stays until the user dismisses it. */
export function showPersistentToast(msg: string): void {
  clearHideTimer();
  _show?.(msg);
}

export function Toast() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const hide = useCallback(() => {
    clearHideTimer();
    const el = wrapRef.current;
    if (el) el.style.display = 'none';
  }, []);

  useEffect(() => {
    _show = (msg: string) => {
      const wrap = wrapRef.current;
      const text = textRef.current;
      const btn = btnRef.current;
      if (!wrap || !text || !btn) return;
      if (!msg) { wrap.style.display = 'none'; return; }
      text.textContent = msg;
      btn.style.display = 'flex';
      wrap.style.display = 'flex';
    };
    return () => {
      _show = null;
      clearHideTimer();
    };
  }, []);

  return (
    <div ref={wrapRef} id="toast" style={{ display: 'none' }}>
      <span ref={textRef} style={{ flex: 1 }} />
      <button
        ref={btnRef}
        onClick={hide}
        aria-label="Close"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'none',
          border: 'none',
          color: 'var(--txt3)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: 14,
          lineHeight: 1,
          borderRadius: 4,
          opacity: 0.7,
        }}
      >
        ✕
      </button>
    </div>
  );
}
