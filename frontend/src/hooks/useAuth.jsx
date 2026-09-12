import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('orqy_token'));
  const [setupStatus, setSetupStatus] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSetup = useCallback(async () => {
    try {
      const res = await fetch('/api/setup/status');
      const data = await res.json();
      setSetupStatus(data);
    } catch {
      setSetupStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkSetup(); }, [checkSetup]);

  // Who is signed in. Orqy accounts are username-based and the email is
  // optional, so `user.email` may well be null for an existing deployment.
  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const data = await res.json();
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    }
  }, [token]);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Login failed');
    }
    const data = await res.json();
    setToken(data.token);
    localStorage.setItem('orqy_token', data.token);
    document.cookie = `orqy_token=${data.token}; path=/; SameSite=Strict`;
    return data;
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    setToken(null);
    setUser(null);
    localStorage.removeItem('orqy_token');
    document.cookie = 'orqy_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  };

  const setup = async (username, password, hostOs) => {
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, host_os: hostOs }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Setup failed');
    }
    const data = await res.json();
    setToken(data.token);
    localStorage.setItem('orqy_token', data.token);
    document.cookie = `orqy_token=${data.token}; path=/; SameSite=Strict`;
    await checkSetup();
    return data;
  };

  const value = {
    token,
    user,
    refreshUser,
    isAuthenticated: !!token,
    setupComplete: setupStatus?.setup_complete ?? false,
    systemInfo: setupStatus?.system ?? null,
    loading,
    login,
    logout,
    setup,
    checkSetup,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
