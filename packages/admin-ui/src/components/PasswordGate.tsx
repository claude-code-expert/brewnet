import { useState } from 'react';
import { LogIn, Loader } from 'lucide-react';
import { useAuth } from '../auth-context.js';

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setPassword } = useAuth();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/health', {
        headers: { 'X-Admin-Password': input },
      });
      if (res.ok) {
        setPassword(input);
      } else {
        setError('잘못된 비밀번호입니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-gate-overlay">
      <div className="password-gate-card">
        <div className="password-gate-logo">☕</div>
        <h2>Brewnet Admin</h2>
        <form onSubmit={handleSubmit}>
          <input
            className="password-gate-input"
            type="password"
            placeholder="Admin password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            disabled={loading}
          />
          {error && <p className="password-gate-error">{error}</p>}
          <button className="btn bp" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
            {loading ? <><Loader size={14} className="spin" /> 확인 중…</> : <><LogIn size={14} /> 확인</>}
          </button>
        </form>
      </div>
    </div>
  );
}
