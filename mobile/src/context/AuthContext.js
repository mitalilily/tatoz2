import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, saveToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    authApi.me()
      .then(result => { if (alive) setUser(result.user || null); })
      .catch(async () => { await saveToken(null); if (alive) setUser(null); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const acceptLogin = useCallback(async payload => {
    if (!payload?.token) throw new Error('The server did not return a mobile session token.');
    await saveToken(payload.token);
    setUser(payload.user || null);
  }, []);

  const signOut = useCallback(async () => {
    try { await authApi.logout(); } catch (_) {}
    await saveToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, isAuthenticated: Boolean(user), acceptLogin, signOut, setUser }), [user, ready, acceptLogin, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

