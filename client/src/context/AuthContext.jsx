import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setUnauthorizedHandler, tokenStore, unwrap } from '../lib/api';
import { toast } from '../lib/toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const startSession = useCallback(({ token, user: u }) => {
    tokenStore.set(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const u = unwrap(await api.get('/auth/me'));
    setUser(u);
    return u;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      tokenStore.set(null);
      setUser((prev) => {
        if (prev) toast.error(message || 'Your session has ended. Please sign in again.');
        return null;
      });
    });
    if (!tokenStore.get()) return;
    refresh()
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      loading,
      setUser,
      refresh,
      logout,
      login: async (email, password) => startSession(unwrap(await api.post('/auth/login', { email, password }))),
      registerUser: async (data) => startSession(unwrap(await api.post('/auth/register', data))),
      registerDoctor: async (formData) => startSession(unwrap(await api.post('/auth/register/doctor', formData)))
    }),
    [user, loading, refresh, logout, startSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
