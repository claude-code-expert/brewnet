import { useState } from 'react';
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
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    </div>
  );
}
