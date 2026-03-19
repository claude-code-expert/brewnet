import { useEffect, useRef } from 'react';

let _setMsg: ((msg: string) => void) | null = null;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Imperative API — call from anywhere in the app. */
export function showToast(msg: string, ms = 2600): void {
  if (!_setMsg) return;
  if (_hideTimer) clearTimeout(_hideTimer);
  _setMsg(msg);
  _hideTimer = setTimeout(() => _setMsg?.(''), ms);
}

export function Toast() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    _setMsg = (msg: string) => {
      const el = ref.current;
      if (!el) return;
      el.textContent = msg;
      el.style.display = msg ? 'flex' : 'none';
    };
    return () => {
      _setMsg = null;
    };
  }, []);

  return (
    <div
      ref={ref}
      id="toast"
      style={{ display: 'none' }}
    />
  );
}
