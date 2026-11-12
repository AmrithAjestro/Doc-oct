import React from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Badge, Button } from '../lib/ui';
import { APPOINTMENT_STATUS, DOCTOR_STATUS, money } from '../lib/format';
import { useBranding } from '../context/BrandingContext';

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

export function Avatar({ name, size = 'md' }) {
  const initials =
    (name || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?';
  const box = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-11 w-11 text-sm';
  return <div className={`flex shrink-0 items-center justify-center rounded-2xl bg-accent-soft font-bold text-indigo-700 dark:text-indigo-300 ${box}`}>{initials}</div>;
}
