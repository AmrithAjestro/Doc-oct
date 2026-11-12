import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, ChevronDown, Inbox, Loader2, AlertTriangle } from 'lucide-react';

// Shared UI kit for the admin console — same names, props and look as the POS app's src/lib/ui.jsx,
// so the two apps read as one product. Colours come from the theme tokens (text-ink, bg-surface, …).

const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ------------------------------- Surfaces & layout ------------------------------- */

export function Panel({ className = '', children, padded = true, ...rest }) {
  return (
    <div className={cx('surface rounded-[20px]', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </div>
  );
}

/** Page title row: title + one-line description on the left, actions on the right (stacked on phones). */
export function PageHeader({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <div className={cx('mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="label-eyebrow mb-1">{eyebrow}</div>}
        <h1 className="truncate text-[22px] font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={cx('flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-[16px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Toolbar({ children, className = '' }) {
  return <div className={cx('flex flex-wrap items-center gap-2 py-1', className)}>{children}</div>;
}

/* ------------------------------- Controls ------------------------------- */

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 border-transparent dark:bg-brand-500 dark:hover:bg-brand-400',
  success: 'bg-green-700 text-white hover:bg-green-800 border-transparent dark:bg-green-600 dark:hover:bg-green-500',
  danger: 'bg-rose-700 text-white hover:bg-rose-800 border-transparent',
  subtle: 'bg-surface text-ink border-line hover:border-line-strong hover:bg-subtle',
  ghost: 'bg-transparent text-ink-2 hover:bg-subtle hover:text-ink border-transparent',
  outline: 'bg-transparent text-accent border-accent hover:bg-accent-soft'
};

export function Button({ variant = 'subtle', size = 'md', icon: Icon, loading = false, className = '', children, type = 'button', ...rest }) {
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-[12.5px]' : size === 'lg' ? 'px-6 py-3 text-[15px]' : 'px-4 py-2 text-[13.5px]';
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        sizing,
        className
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/** Square icon-only button. `label` is required: it is the tooltip and the screen-reader name. */
export function IconButton({ icon: Icon, label, tone = 'neutral', className = '', ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle disabled:opacity-40',
        tone === 'danger' ? 'hover:text-rose-600' : 'hover:text-ink',
        className
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function Field({ label, hint, required, error, className = '', children }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="label-eyebrow mb-1.5 block">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-semibold text-rose-500">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>
      )}
    </label>
  );
}

export const Input = React.forwardRef(({ className = '', ...rest }, ref) => (
  <input ref={ref} className={cx('field-input', className)} {...rest} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef(({ className = '', rows = 3, ...rest }, ref) => (
  <textarea ref={ref} rows={rows} className={cx('field-input resize-y', className)} {...rest} />
));
Textarea.displayName = 'Textarea';

/** Native select styled like the inputs (keyboard and mobile pickers keep working). */
export function Select({ className = '', children, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <select className="field-input cursor-pointer appearance-none pr-8" {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '', ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
      <input
        className="field-input text-xs"
        style={{ paddingLeft: '2.1rem', paddingRight: value ? '2rem' : undefined }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-3 transition-colors hover:text-ink"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SegmentedControl({ options, value, onChange, className = '' }) {
  return (
    <div className={cx('inline-flex items-center gap-0.5 rounded-xl border border-line bg-subtle p-0.5', className)}>
      {options.map((opt) => {
        const key = opt.value ?? opt;
        const label = opt.label ?? opt;
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={cx(
              'rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
              active ? 'bg-surface text-brand-700 ring-1 ring-line dark:text-brand-300' : 'text-ink-2 hover:text-ink'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Data display ------------------------------- */

const TONES = {
  neutral: 'bg-subtle text-ink-2',
  accent: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-800',
  success: 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200 dark:bg-green-950/50 dark:text-green-300 dark:ring-green-900',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
};

export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Badge tone for the status words the backend uses on shops, organisations, devices and payments. */
export function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (['active', 'paid', 'success', 'approved', 'online', 'verified'].includes(s)) return 'success';
  if (['trial', 'pending', 'grace', 'due', 'invited'].includes(s)) return 'warning';
  if (['inactive', 'suspended', 'blocked', 'failed', 'expired', 'rejected', 'overdue', 'cancelled'].includes(s)) return 'danger';
  return 'neutral';
}

export function StatTile({ label, value, sub, tone = 'neutral', onClick }) {
  const accent = {
    neutral: 'text-ink',
    accent: 'text-brand-600 dark:text-brand-400',
    success: 'text-green-700 dark:text-green-400',
    danger: 'text-rose-600 dark:text-rose-400',
    warning: 'text-amber-600 dark:text-amber-400'
  }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx('surface w-full rounded-[20px] p-5 text-left transition-colors', onClick && 'cursor-pointer hover:border-line-strong')}
    >
      <div className="label-eyebrow">{label}</div>
      <div className={cx('tabular mt-1.5 truncate text-[30px] font-semibold leading-tight tracking-tight', accent)}>{value}</div>
      {sub && <div className="mt-1 truncate text-[12.5px] text-ink-2">{sub}</div>}
    </Tag>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-subtle">
        <Icon className="h-5 w-5 text-ink-3" />
      </div>
      <div className="text-sm font-bold text-ink">{title}</div>
      {hint && <div className="max-w-sm text-xs leading-relaxed text-ink-2">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-xs font-semibold text-ink-3" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

/** Grey placeholder rows shown while a table's data loads. */
export function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-3 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="skeleton h-4 flex-1" style={{ maxWidth: c === 0 ? '30%' : undefined }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Table shell with sticky headers and per-column alignment. columns: [{ key, label, align, width, render(row, index), className }] */
export function DataTable({ columns, rows, rowKey = (row, i) => row.id ?? i, loading = false, empty, maxHeight = '65vh', onRowClick, className = '' }) {
  if (loading && (!rows || rows.length === 0)) {
    return (
      <div className={cx('surface rounded-[20px]', className)}>
        <SkeletonRows cols={Math.min(columns.length, 5)} />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return <div className={cx('surface rounded-[20px]', className)}>{empty || <EmptyState title="Nothing to show yet" />}</div>;
  }
  return (
    <div className={cx('surface overflow-hidden rounded-[20px]', className)}>
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="ledger-table w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width, textAlign: col.align || 'left' }} className={col.headClassName}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row, i) : undefined} className={cx(onRowClick && 'cursor-pointer')}>
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align || 'left' }} className={cx(col.className, col.align === 'right' && 'tabular', 'text-ink')}>
                    {col.render ? col.render(row, i) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Overlays ------------------------------- */

const MODAL_WIDTH = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl'
};

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

/** Centered dialog. On phones it becomes a bottom sheet the full width of the screen. */
export function Modal({ open, onClose, title, subtitle, size = 'md', className = '', footer, children }) {
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={cx(
              'surface-raised flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-[var(--shadow-lg)] sm:rounded-2xl',
              MODAL_WIDTH[size] || MODAL_WIDTH.md,
              className
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-ink">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
              </div>
              <IconButton icon={X} label="Close (Esc)" tone="danger" onClick={onClose} className="-mr-1.5 -mt-1" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

const DRAWER_WIDTH = {
  sm: 'sm:w-[380px]',
  md: 'sm:w-[480px]',
  lg: 'sm:w-[640px]'
};

/** Right-edge slide-in panel; full screen on phones. */
export function Drawer({ open, onClose, title, subtitle, size = 'md', className = '', headerActions, footer, children }) {
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
            className={cx('surface-raised flex h-full w-full flex-col shadow-[var(--shadow-lg)]', DRAWER_WIDTH[size] || DRAWER_WIDTH.md, className)}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-bold text-ink">{title}</h3>
                {subtitle && <p className="mt-0.5 truncate text-xs text-ink-2">{subtitle}</p>}
              </div>
              <div className="-mr-1.5 -mt-1 flex shrink-0 items-center gap-1">
                {headerActions}
                <IconButton icon={X} label="Close (Esc)" tone="danger" onClick={onClose} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ------------------------------- In-app confirm ------------------------------- */

// One confirm at a time, shown by <ConfirmHost /> (mounted once in App) — replaces window.confirm,
// whose browser popup looks different on every PC and can be switched off by the browser.
let confirmListener = null;
const confirmQueue = [];

/**
 * Asks the operator in an on-screen popup. Resolves true (confirmed) or false (cancelled / Esc).
 * `opts`: { title, confirmLabel, cancelLabel, danger }.
 */
export function askConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    confirmQueue.push({ message, ...opts, resolve });
    confirmListener?.();
  });
}

export function ConfirmHost() {
  const [, setTick] = useState(0);
  useEffect(() => {
    confirmListener = () => setTick((t) => t + 1);
    if (confirmQueue.length) confirmListener();
    return () => {
      confirmListener = null;
    };
  }, []);
  const current = confirmQueue[0];

  const answer = (value) => {
    const item = confirmQueue.shift();
    item?.resolve(value);
    setTick((t) => t + 1);
  };

  useEffect(() => {
    if (!current) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        answer(false);
      }
    };
    // Capture phase, so Esc closes only this popup and not the modal underneath it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return createPortal(
    <AnimatePresence>
      {current && (
        <motion.div
          key="confirm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && answer(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.14 }}
            role="alertdialog"
            aria-modal="true"
            className="surface-raised w-full max-w-sm overflow-hidden rounded-2xl shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-start gap-3 px-5 pb-3 pt-5">
              <div
                className={cx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  current.danger ? 'bg-rose-500/15 text-rose-600' : 'bg-amber-500/15 text-amber-600'
                )}
              >
                <AlertTriangle className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-ink">{current.title || 'Please confirm'}</h3>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{current.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 bg-subtle px-5 py-3.5">
              <Button size="sm" onClick={() => answer(false)}>
                {current.cancelLabel || 'Cancel'}
              </Button>
              <Button size="sm" autoFocus variant={current.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
                {current.confirmLabel || 'Confirm'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export { cx };

/* ------------------------------- Table helpers for hand-built <table className="ledger-table"> ------------------------------- */

/** Full-width table row holding an EmptyState (no hover highlight). */
export function EmptyRow({ colSpan, icon, title, hint, action }) {
  return (
    <tr className="[&>td]:!bg-transparent">
      <td colSpan={colSpan}>
        <EmptyState icon={icon} title={title} hint={hint} action={action} />
      </td>
    </tr>
  );
}

/** Placeholder rows shown inside a table while it loads. */
export function LoadingRows({ colSpan, rows = 4 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={`loading-${r}`} className="[&>td]:!bg-transparent" aria-hidden="true">
      {Array.from({ length: colSpan }).map((__, c) => (
        <td key={c}>
          <div className="skeleton h-3.5" style={{ width: c === 0 ? '70%' : '50%' }} />
        </td>
      ))}
    </tr>
  ));
}

const ROW_ACTION_TONES = {
  neutral: 'bg-subtle text-ink-2 hover:text-ink hover:bg-line',
  accent: 'bg-subtle text-ink-2 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/50 dark:hover:text-brand-300',
  warning: 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300',
  success: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300',
  danger: 'bg-subtle text-ink-2 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400',
  special: 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300'
};

/** Small icon button for a table row's actions. `label` is the tooltip and screen-reader name. */
export function RowAction({ icon: Icon, label, tone = 'neutral', className = '', ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        ROW_ACTION_TONES[tone],
        className
      )}
      {...rest}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** On/off switch (a styled checkbox, so keyboard and screen readers treat it as one). */
export function Switch({ checked, onChange, label, tone = 'accent', disabled = false }) {
  return (
    <label className={cx('relative inline-flex shrink-0 items-center', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cx(
          "h-6 w-11 rounded-full bg-line transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all after:content-[''] peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--accent)]",
          tone === 'warning' ? 'peer-checked:bg-amber-500' : 'peer-checked:bg-brand-600'
        )}
      />
    </label>
  );
}
