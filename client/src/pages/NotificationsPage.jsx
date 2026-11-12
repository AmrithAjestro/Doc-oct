import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CalendarCheck2, CalendarClock, CalendarX2, CheckCheck, FileText, ShieldCheck, Stethoscope } from 'lucide-react';
import { PageHeader, Button, SegmentedControl, EmptyState, SkeletonRows } from '../lib/ui';
import { ErrorBanner, Pagination } from '../components/common';
import { useAsync } from '../lib/useAsync';
import { useCounts } from '../components/AppShell';
import api, { errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { dateTime, relative } from '../lib/format';

const iconFor = (type) => {
  if (type.startsWith('reminder')) return BellRing;
  if (type.includes('cancel') || type.includes('no_show')) return CalendarX2;
  if (type.includes('reschedul')) return CalendarClock;
  if (type.includes('prescription')) return FileText;
  if (type.startsWith('doctor_registered')) return Stethoscope;
  if (type.startsWith('doctor_')) return ShieldCheck;
  return CalendarCheck2;
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { refreshCounts } = useCounts();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload, setData } = useAsync(
    () => api.get('/notifications', { params: { unread: filter === 'unread' ? 'true' : undefined, page } }),
    [filter, page],
    { live: true }
  );

  const markRead = async (n) => {
    if (n.readAt) return;
    setData((rows) => rows.map((r) => (r.id === n.id ? { ...r, readAt: new Date().toISOString() } : r)));
    await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    refreshCounts();
  };

  const open = (n) => {
    markRead(n);
    if (n.appointmentId) navigate(`/appointments/${n.appointmentId}`);
    else if (n.type === 'doctor_registered') navigate('/admin/doctors');
    else if (n.type === 'waitlist_opening') navigate('/doctors');
  };

  const markAll = async () => {
    try {
      await api.patch('/notifications/read-all');
      toast.success('All notifications marked as read');
      reload();
      refreshCounts();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Booking updates and reminders. You also receive these by e-mail when it is set up."
        actions={
          <Button icon={CheckCheck} onClick={markAll} disabled={!meta?.unread}>
            Mark all read
          </Button>
        }
      />
      <div className="mb-4">
        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: `Unread${meta?.unread ? ` (${meta.unread})` : ''}` }
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
        />
      </div>
      <ErrorBanner message={error} onRetry={reload} />
      <div className="surface overflow-hidden rounded-2xl">
        {loading && !data ? (
          <SkeletonRows rows={6} cols={2} />
        ) : !data?.length ? (
          <EmptyState icon={Bell} title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'} />
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {data.map((n) => {
              const Icon = iconFor(n.type);
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-subtle">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${n.readAt ? 'bg-subtle text-ink-3' : 'bg-accent-soft text-brand-600 dark:text-brand-300'}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-[13px] ${n.readAt ? 'font-semibold text-ink-2' : 'font-bold text-ink'}`}>{n.title}</span>
                        {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">{n.message}</span>
                      <span className="mt-1 block text-[11px] text-ink-3" title={dateTime(n.createdAt)}>
                        {relative(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}
