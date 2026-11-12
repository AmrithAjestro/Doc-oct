import React from 'react';
import { Stethoscope } from 'lucide-react';
import { useBranding } from '../context/BrandingContext';

/** Logo + app name as configured by the admin (falls back to an icon). */
export default function Brand({ subtitle, size = 'md', className = '' }) {
  const { appName, logoSrc } = useBranding();
  const box = size === 'lg' ? 'h-11 w-11' : 'h-8 w-8';
  return (
    <div className={`flex items-center gap-2.5 overflow-hidden ${className}`}>
      {logoSrc ? (
        <img src={logoSrc} alt="" className={`${box} shrink-0 rounded-lg object-contain`} />
      ) : (
        <div className={`${box} flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white`}>
          <Stethoscope className={size === 'lg' ? 'h-6 w-6' : 'h-[18px] w-[18px]'} />
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <div className={`truncate font-black tracking-tight text-ink ${size === 'lg' ? 'text-xl' : 'text-[15px]'}`}>{appName}</div>
        {subtitle && <div className="truncate text-[11px] font-semibold text-ink-2">{subtitle}</div>}
      </div>
    </div>
  );
}
