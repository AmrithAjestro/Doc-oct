import React, { Suspense, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import TopNav from './TopNav';
import { askConfirm, Spinner } from '../lib/ui';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../lib/theme';
import api, { unwrap } from '../lib/api';

const CountsContext = createContext({ unread: 0, refreshCounts: () => {} });
/** Lets a page refresh the sidebar badges after it changes something (e.g. marks notifications read). */
export const useCounts = () => useContext(CountsContext);

const POLL_MS = 30000;

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDarkMode, setIsDarkMode] = useDarkMode();
  const [counts, setCounts] = useState({ unread: 0, pendingDoctors: 0 });

  const refreshCounts = useCallback(async () => {
    try {
      const { unread } = unwrap(await api.get('/notifications/unread-count'));
      let pendingDoctors = 0;
      if (user.role === 'admin') {
        const res = await api.get('/admin/doctors', { params: { status: 'pending', limit: 1 } });
        pendingDoctors = res.data.meta.total;
      }
      setCounts({ unread, pendingDoctors });
    } catch {
      /* badges are best-effort */
    }
  }, [user.role]);

  // New notifications arrive from the server's reminder job; poll while the tab is visible.
  useEffect(() => {
    refreshCounts();
    const timer = setInterval(() => document.visibilityState === 'visible' && refreshCounts(), POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCounts]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const handleLogout = async () => {
    if (await askConfirm('You will need to sign in again to use the app.', { title: 'Sign out?', confirmLabel: 'Sign out' })) {
      logout();
      navigate('/login');
    }
  };

  return (
    <CountsContext.Provider value={{ ...counts, refreshCounts }}>
      <div className="min-h-screen bg-canvas text-ink">
        <TopNav user={user} counts={counts} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onLogout={handleLogout} />
        {/* Each page carries its own title and actions. */}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </CountsContext.Provider>
  );
}
