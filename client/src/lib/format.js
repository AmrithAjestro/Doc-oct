const safeDate = (d) => (d ? new Date(d) : null);

export function money(value, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

const fmt = (opts) => (d) => (safeDate(d) ? new Intl.DateTimeFormat('en-IN', opts).format(new Date(d)) : '—');

export const dateTime = fmt({ dateStyle: 'medium', timeStyle: 'short' });
export const dateOnly = fmt({ dateStyle: 'medium' });
export const timeOnly = fmt({ hour: 'numeric', minute: '2-digit' });
export const dayLabel = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
export const weekdayShort = fmt({ weekday: 'short' });

/** "in 3 h", "2 d ago" — short relative time for lists. */
export function relative(d) {
  if (!d) return '';
  const diff = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['d', 86400e3],
    ['h', 3600e3],
    ['min', 60e3]
  ];
  for (const [label, size] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      return diff > 0 ? `in ${n} ${label}` : `${n} ${label} ago`;
    }
  }
  return diff > 0 ? 'in a moment' : 'just now';
}

/** Local calendar day, YYYY-MM-DD (not UTC: a 00:30 IST slot belongs to that IST day). */
export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export const doctorName = (doctor) => (doctor?.user?.name ? `Dr. ${doctor.user.name}` : 'Doctor');

export const APPOINTMENT_STATUS = {
  pending_confirmation: { label: 'Awaiting confirmation', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'accent' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  no_show: { label: 'No-show', tone: 'neutral' }
};

export const DOCTOR_STATUS = {
  pending: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' }
};

export const ROLE_LABEL = { user: 'Patient', doctor: 'Doctor', admin: 'Administrator' };
