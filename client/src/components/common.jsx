import React from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Badge, Button } from '../lib/ui';
import { APPOINTMENT_STATUS, DOCTOR_STATUS, money } from '../lib/format';
import { useBranding } from '../context/BrandingContext';
import { assetUrl } from '../lib/api';

export function AppointmentStatusBadge({ status }) {
  const s = APPOINTMENT_STATUS[status] || { label: status, tone: 'neutral' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function DoctorStatusBadge({ status }) {
  const s = DOCTOR_STATUS[status] || { label: status, tone: 'neutral' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Doctor fee + platform fee = total, from a pricing object or an appointment's snapshot. */
export function FeeBreakdown({ doctorFee, commission, totalFee, className = '' }) {
  const { currency } = useBranding();
  const row = 'flex items-center justify-between text-[13px]';
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className={row}>
        <span className="text-ink-2">Consultation fee</span>
        <span className="tabular font-semibold text-ink">{money(doctorFee, currency)}</span>
      </div>
      <div className={row}>
        <span className="text-ink-2">Platform fee</span>
        <span className="tabular font-semibold text-ink">{money(commission, currency)}</span>
      </div>
      <div className={`${row} border-t border-line pt-1.5`}>
        <span className="font-bold text-ink">Total payable</span>
        <span className="tabular text-[15px] font-bold text-ink">{money(totalFee, currency)}</span>
      </div>
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-ink-2">
      <span className="tabular">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <div className="flex gap-2">
        <Button size="sm" icon={ChevronLeft} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Coloured information strip. tone: info | warning | success | danger */
export function Notice({ tone = 'info', icon: Icon, title, children, action, className = '' }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
  };
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${tones[tone]} ${className}`}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {title && <div className="font-bold">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 'md', photoUrl }) {
  const initials =
    (name || '?')
      .replace(/^dr\.?\s+/i, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?';
  const box = size === 'lg' ? 'h-20 w-20 text-[22px]' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-11 w-11 text-sm';
  if (photoUrl) return <img src={assetUrl(photoUrl)} alt="" className={`shrink-0 rounded-full object-cover ${box}`} />;
  return <div className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-brand-700 dark:text-brand-300 ${box}`}>{initials}</div>;
}

/** 1-5 stars, read-only or as an input (onChange). */
export function Stars({ value = 0, onChange, size = 'md' }) {
  const box = size === 'lg' ? 'h-7 w-7' : 'h-4 w-4';
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? 'Rating' : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value);
        const star = (
          <svg viewBox="0 0 20 20" className={`${box} ${on ? 'fill-amber-400' : 'fill-line-strong'}`} aria-hidden="true">
            <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8z" />
          </svg>
        );
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="rounded p-0.5 hover:scale-110">
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

/** "4.8 (12 reviews)" or "No reviews yet". */
export function RatingLine({ avg, count }) {
  if (!count) return <span className="text-[13px] text-ink-3">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13.5px]">
      <Stars value={avg} />
      <b className="font-semibold text-ink">{Number(avg).toFixed(1)}</b>
      <span className="text-ink-2">({count} {count === 1 ? 'review' : 'reviews'})</span>
    </span>
  );
}
