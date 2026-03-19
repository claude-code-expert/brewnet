import { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface AuthContextValue {
  password: string | null;
  setPassword: (pw: string) => void;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [password, setPasswordState] = useState<string | null>(
    () => sessionStorage.getItem('adminPassword'),
  );

  const setPassword = useCallback((pw: string) => {
    sessionStorage.setItem('adminPassword', pw);
    setPasswordState(pw);
  }, []);

  const apiFetch = useCallback(
    (url: string, init: RequestInit = {}): Promise<Response> => {
      return fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          ...(password ? { 'X-Admin-Password': password } : {}),
        },
      });
    },
    [password],
  );

  const value = useMemo(
    () => ({ password, setPassword, apiFetch, isAuthenticated: !!password }),
    [password, setPassword, apiFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
