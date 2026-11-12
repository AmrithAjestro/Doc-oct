import React from 'react';
import { useBranding } from '../context/BrandingContext';

/** The app mark: a calendar page carrying a medical cross — "a doctor's appointment" at a glance. */
export function LogoMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2563EB" />
      <rect x="7" y="9" width="18" height="16.5" rx="3.5" fill="#FFFFFF" />
      <rect x="10.6" y="6" width="2.6" height="6" rx="1.3" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.2" />
      <rect x="18.8" y="6" width="2.6" height="6" rx="1.3" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.2" />
      <rect x="14.6" y="13.6" width="2.8" height="8.8" rx="1" fill="#2563EB" />
      <rect x="11.6" y="16.6" width="8.8" height="2.8" rx="1" fill="#2563EB" />
    </svg>
  );
}

/** Logo + app name as configured by the admin (an uploaded logo replaces the built-in mark). */
export default function Brand({ subtitle, size = 'md', className = '' }) {
  const { appName, logoSrc } = useBranding();
  const box = size === 'lg' ? 'h-11 w-11' : 'h-8 w-8';
  return (
    <div className={`flex items-center gap-2.5 overflow-hidden ${className}`}>
      {logoSrc ? <img src={logoSrc} alt="" className={`${box} shrink-0 rounded-lg object-contain`} /> : <LogoMark className={`${box} shrink-0`} />}
      <div className="min-w-0 leading-tight">
        <div className={`truncate font-bold tracking-tight text-ink ${size === 'lg' ? 'text-[22px]' : 'text-[17px]'}`}>{appName}</div>
        {subtitle && <div className="truncate text-[12px] font-medium text-ink-2">{subtitle}</div>}
      </div>
    </div>
  );
}
