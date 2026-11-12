import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  CalendarDays,
  CalendarClock,
  Bell,
  UserRound,
  Stethoscope,
  Users,
  Settings,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X
} from 'lucide-react';
import Brand from './Brand';
import { initials, ROLE_LABEL } from '../lib/format';

/** Menu per role. A doctor awaiting approval only sees what they can use. */
export function menuFor(user, counts = {}) {
  const notifications = { to: '/notifications', label: 'Notifications', icon: Bell, count: counts.unread };
  if (user.role === 'admin') {
    return [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/admin/doctors', label: 'Doctors', icon: Stethoscope, count: counts.pendingDoctors },
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/appointments', label: 'Appointments', icon: CalendarDays },
      notifications,
      { to: '/admin/settings', label: 'Settings', icon: Settings }
    ];
  }
  if (user.role === 'doctor') {
    const approved = user.doctorProfile?.status === 'approved';
    return [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ...(approved
        ? [
            { to: '/appointments', label: 'Appointments', icon: CalendarDays },
            { to: '/availability', label: 'Availability', icon: CalendarClock }
          ]
        : []),
      notifications,
      { to: '/account', label: 'My profile', icon: UserRound }
    ];
  }
  return [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/doctors', label: 'Find doctors', icon: Search },
    { to: '/appointments', label: 'My appointments', icon: CalendarDays },
    notifications,
    { to: '/account', label: 'Account', icon: UserRound }
  ];
}

const iconButton = 'inline-flex items-center justify-center p-2 rounded-lg shrink-0 text-ink-2 hover:text-ink hover:bg-subtle transition-colors';

function IconAction({ icon: Icon, label, onClick, className = '' }) {
  return (
    <button type="button" onClick={onClick} className={`${iconButton} ${className}`} title={label} aria-label={label}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function Sidebar({ user, counts, isCollapsed, setIsCollapsed, mobileOpen, onCloseMobile, isDarkMode, setIsDarkMode, onLogout }) {
  const collapsed = isCollapsed && !mobileOpen;
  const displayName = user.role === 'doctor' ? `Dr. ${user.name}` : user.name;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/50 transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        aria-label="Main menu"
        className={`fixed bottom-0 left-0 top-0 z-50 flex w-64 flex-col border-r border-line bg-surface text-ink transition-all duration-300 lg:z-40 ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-line px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && <Brand subtitle={ROLE_LABEL[user.role]} />}
          <IconAction
            icon={collapsed ? ChevronRight : ChevronLeft}
            label={collapsed ? 'Expand menu' : 'Collapse menu'}
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:inline-flex"
          />
          <IconAction icon={X} label="Close menu" onClick={onCloseMobile} className="lg:hidden" />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {menuFor(user, counts).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${collapsed ? 'justify-center' : ''} ${
                    isActive ? 'bg-accent-soft text-indigo-700 dark:text-indigo-300' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? '' : 'text-ink-3'}`} />
                    {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                    {item.count > 0 &&
                      (collapsed ? (
                        <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
                      ) : (
                        <span className="tabular rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{item.count > 99 ? '99+' : item.count}</span>
                      ))}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-line p-3">
          {!collapsed && (
            <div className="flex items-center gap-2.5 px-1" title={user.email}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{initials(user.name)}</div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-bold text-ink">{displayName}</div>
                <div className="truncate text-[11px] text-ink-2">{user.email}</div>
              </div>
            </div>
          )}
          <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'justify-between'}`}>
            <IconAction icon={isDarkMode ? Sun : Moon} label={isDarkMode ? 'Light theme' : 'Dark theme'} onClick={() => setIsDarkMode(!isDarkMode)} />
            <IconAction icon={LogOut} label="Sign out" onClick={onLogout} className="hover:!text-rose-600 dark:hover:!text-rose-400" />
          </div>
        </div>
      </aside>
    </>
  );
}
