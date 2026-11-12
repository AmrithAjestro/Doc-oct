import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bell, Menu, X, Sun, Moon, LogOut, UserRound, ChevronDown } from 'lucide-react';
import Brand from './Brand';
import { initials, ROLE_LABEL } from '../lib/format';

/** Menu per role. A doctor awaiting approval only sees what they can use. Notifications live on the bell. */
export function menuFor(user, counts = {}) {
  if (user.role === 'admin') {
    return [
      { to: '/dashboard', label: 'Overview' },
      { to: '/admin/doctors', label: 'Doctors', count: counts.pendingDoctors },
      { to: '/admin/users', label: 'Users' },
      { to: '/appointments', label: 'Appointments' },
      { to: '/admin/settings', label: 'Settings' }
    ];
  }
  if (user.role === 'doctor') {
    const approved = user.doctorProfile?.status === 'approved';
    return [
      { to: '/dashboard', label: 'Today' },
      ...(approved
        ? [
            { to: '/appointments', label: 'Appointments' },
            { to: '/availability', label: 'Availability' }
          ]
        : [])
    ];
  }
  return [
    { to: '/doctors', label: 'Find doctors' },
    { to: '/appointments', label: 'My appointments' },
    { to: '/dashboard', label: 'Overview' }
  ];
}

const linkClass = ({ isActive }) =>
  `relative inline-flex h-16 items-center gap-1.5 px-1 text-[15px] font-medium transition-colors ${
    isActive
      ? 'text-brand-700 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-brand-600 dark:text-brand-300 dark:after:bg-brand-400'
      : 'text-ink-2 hover:text-ink'
  }`;

function CountPill({ n }) {
  if (!n) return null;
  return <span className="tabular rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">{n > 99 ? '99+' : n}</span>;
}

/** Account menu: closes on outside click and Escape. */
function AccountMenu({ user, isDarkMode, setIsDarkMode, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const displayName = user.role === 'doctor' ? `Dr. ${user.name}` : user.name;
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] text-ink hover:bg-subtle';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-subtle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">{initials(user.name)}</span>
        <span className="hidden max-w-[140px] truncate text-[14px] font-medium text-ink md:block">{displayName}</span>
        <ChevronDown className="h-4 w-4 text-ink-3" />
      </button>
      {open && (
        <div role="menu" className="surface-raised absolute right-0 top-12 z-50 w-64 rounded-2xl p-1.5 shadow-[var(--shadow-lg)]">
          <div className="px-3 pb-2.5 pt-2">
            <div className="truncate text-[14px] font-semibold text-ink">{displayName}</div>
            <div className="truncate text-[13px] text-ink-2">{user.email}</div>
            <div className="mt-1 text-[12px] text-ink-3">{ROLE_LABEL[user.role]}</div>
          </div>
          <div className="my-1 border-t border-line" />
          {user.role !== 'admin' && (
            <Link to="/account" role="menuitem" className={item} onClick={() => setOpen(false)}>
              <UserRound className="h-4 w-4 text-ink-3" /> {user.role === 'doctor' ? 'My profile' : 'Account'}
            </Link>
          )}
          <button type="button" role="menuitem" className={item} onClick={() => setIsDarkMode(!isDarkMode)}>
            {isDarkMode ? <Sun className="h-4 w-4 text-ink-3" /> : <Moon className="h-4 w-4 text-ink-3" />} {isDarkMode ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-rose-700 dark:text-rose-400`}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopNav({ user, counts, isDarkMode, setIsDarkMode, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = menuFor(user, counts);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="-ml-2 rounded-lg p-2 text-ink-2 hover:bg-subtle lg:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link to="/dashboard" className="shrink-0">
          <Brand />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} className={linkClass}>
              {it.label}
              <CountPill n={it.count} />
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <NavLink
            to="/notifications"
            aria-label={`Notifications${counts.unread ? `, ${counts.unread} unread` : ''}`}
            className={({ isActive }) => `relative rounded-full p-2.5 hover:bg-subtle ${isActive ? 'text-brand-700 dark:text-brand-300' : 'text-ink-2'}`}
          >
            <Bell className="h-5 w-5" />
            {counts.unread > 0 && (
              <span className="tabular absolute right-1 top-1 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                {counts.unread > 99 ? '99+' : counts.unread}
              </span>
            )}
          </NavLink>
          <AccountMenu user={user} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onLogout={onLogout} />
        </div>
      </div>

      {mobileOpen && (
        <nav aria-label="Main" className="border-t border-line px-4 py-2 lg:hidden">
          {[...items, { to: '/notifications', label: 'Notifications', count: counts.unread }].map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-xl px-3 py-3 text-[15px] font-medium ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'text-ink'}`
              }
            >
              {it.label}
              <CountPill n={it.count} />
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
