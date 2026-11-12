import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, CalendarClock, ShieldAlert, ShieldX, ArrowRight, CalendarDays, Clock } from 'lucide-react';
import { PageHeader, Panel, SectionHeader, StatTile, Button, EmptyState, Spinner, DataTable, Badge } from '../lib/ui';
import { AppointmentStatusBadge, Avatar, ErrorBanner, Notice } from '../components/common';
import AppointmentActions from '../components/AppointmentActions';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import api from '../lib/api';
import { APPOINTMENT_STATUS, dateTime, doctorName, money, relative, timeOnly } from '../lib/format';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function AppointmentRow({ a, who, onChange }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <button type="button" onClick={() => navigate(`/appointments/${a.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={who === 'doctor' ? a.doctor?.user?.name : a.patient?.name} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-ink">{who === 'doctor' ? doctorName(a.doctor) : a.patient?.name}</div>
          <div className="text-[11px] text-ink-2">
            {dateTime(a.startAt)} · {relative(a.startAt)}
          </div>
        </div>
        <AppointmentStatusBadge status={a.status} />
      </button>
      <AppointmentActions appointment={a} onChange={onChange} showLockHint={false} />
    </div>
  );
}

/* --------------------------------------------------------------- patient */

function UserDashboard({ data, user, setData }) {
  const { currency } = useBranding();
  const replace = (u) => setData((d) => ({ ...d, upcoming: d.upcoming.map((x) => (x.id === u.id ? u : x)).filter((x) => ['pending_confirmation', 'confirmed'].includes(x.status)) }));
  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle="Your upcoming visits and anything that needs your attention."
        actions={
          <Link to="/doctors">
            <Button variant="primary" icon={Search}>
              Find a doctor
            </Button>
          </Link>
        }
      />
      {data.awaitingConfirmation > 0 && (
        <Notice tone="warning" icon={CalendarClock} title={`${data.awaitingConfirmation} appointment${data.awaitingConfirmation > 1 ? 's' : ''} awaiting your confirmation`} className="mb-5">
          Confirm before the deadline, or the booking is moved to the next free slot.
        </Notice>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Upcoming" value={data.statusCounts.pending_confirmation + data.statusCounts.confirmed} tone="accent" />
        <StatTile label="Completed visits" value={data.statusCounts.completed} tone="success" />
        <StatTile label="Prescriptions" value={data.prescriptions} />
        <StatTile label="Total spent" value={money(data.totalSpent, currency)} />
      </div>
      <Panel padded={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <SectionHeader title="Upcoming appointments" />
          <Link to="/appointments" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.upcoming.length ? (
          <div className="divide-y divide-[color:var(--border)]">
            {data.upcoming.map((a) => (
              <AppointmentRow key={a.id} a={a} who="doctor" onChange={replace} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming appointments"
            hint="Browse doctors and book a free slot."
            action={
              <Link to="/doctors">
                <Button variant="primary">Find a doctor</Button>
              </Link>
            }
          />
        )}
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------------- doctor */

function DoctorDashboard({ data, user, setData }) {
  const { currency } = useBranding();
  if (data.profileStatus !== 'approved') {
    const rejected = data.profileStatus === 'rejected';
    return (
      <>
        <PageHeader title={`Welcome, Dr. ${user.name}`} />
        <Panel className="flex flex-col items-center gap-3 py-12 text-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${rejected ? 'bg-rose-500/15 text-rose-600' : 'bg-amber-500/15 text-amber-600'}`}>
            {rejected ? <ShieldX className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
          </div>
          <h2 className="text-lg font-bold text-ink">{rejected ? 'Your profile was not approved' : 'Your profile is under review'}</h2>
          <p className="max-w-md text-[13px] leading-relaxed text-ink-2">
            {rejected
              ? `Reason: ${data.rejectionReason || 'not given'}. Upload a corrected certificate from your profile to be reviewed again.`
              : 'An administrator is verifying your registration certificate. Once approved you can publish availability and receive bookings — we will notify you.'}
          </p>
          <Link to="/account">
            <Button variant="primary">{rejected ? 'Upload new certificate' : 'Review my profile'}</Button>
          </Link>
        </Panel>
      </>
    );
  }
  const replace = (u) => setData((d) => ({ ...d, today: d.today.map((x) => (x.id === u.id ? u : x)) }));
  return (
    <>
      <PageHeader
        title={`${greeting()}, Dr. ${user.name.split(' ')[0]}`}
        subtitle="Today’s schedule at a glance."
        actions={
          <Link to="/availability">
            <Button variant="primary" icon={CalendarClock}>
              Manage availability
            </Button>
          </Link>
        }
      />
      {data.openSlots === 0 && (
        <Notice tone="warning" icon={CalendarClock} className="mb-5" action={<Link to="/availability"><Button size="sm">Add slots</Button></Link>}>
          You have no open slots — patients cannot book you until you add availability.
        </Notice>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Today" value={data.today.length} tone="accent" />
        <StatTile label="Upcoming" value={data.upcomingCount} />
        <StatTile label="Open slots" value={data.openSlots} />
        <StatTile label="Patients seen" value={data.uniquePatients} tone="success" />
        <StatTile label="Earnings" value={money(data.earnings, currency)} sub="Completed visits" />
      </div>
      <Panel padded={false}>
        <div className="border-b border-line px-4 py-3.5">
          <SectionHeader title="Today" />
        </div>
        {data.today.length ? (
          <div className="divide-y divide-[color:var(--border)]">
            {data.today.map((a) => (
              <div key={a.id} className="flex items-stretch">
                <div className="tabular flex w-20 shrink-0 flex-col items-center justify-center border-r border-line text-[12px] font-bold text-ink">
                  <Clock className="mb-1 h-3.5 w-3.5 text-ink-3" />
                  {timeOnly(a.startAt)}
                </div>
                <div className="min-w-0 flex-1">
                  <AppointmentRow a={a} who="patient" onChange={replace} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarDays} title="No appointments today" />
        )}
      </Panel>
    </>
  );
}

/* ----------------------------------------------------------------- admin */

function AdminDashboard({ data }) {
  const { currency } = useBranding();
  const navigate = useNavigate();
  const total = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Users, doctors, bookings and commission earned." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Patients" value={data.patients} onClick={() => navigate('/admin/users')} />
        <StatTile label="Doctors" value={data.doctors.approved} sub={`${data.doctors.pending} pending review`} tone={data.doctors.pending ? 'warning' : 'neutral'} onClick={() => navigate('/admin/doctors')} />
        <StatTile label="Appointments today" value={data.todayCount} tone="accent" onClick={() => navigate('/appointments')} />
        <StatTile label="Commission earned" value={money(data.revenue.commission, currency)} tone="success" sub="Completed visits" />
        <StatTile label="Gross bookings" value={money(data.revenue.gross, currency)} sub="Completed visits" />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionHeader title="Appointments by status" subtitle={`${total} in total`} className="mb-4" />
          <div className="space-y-3">
            {Object.entries(APPOINTMENT_STATUS).map(([k, s]) => {
              const n = data.statusCounts[k] || 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              const bar = { warning: 'bg-amber-500', accent: 'bg-indigo-500', success: 'bg-emerald-500', danger: 'bg-rose-500', neutral: 'bg-slate-400' }[s.tone];
              return (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold text-ink-2">{s.label}</span>
                    <span className="tabular font-bold text-ink">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-subtle">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel padded={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <SectionHeader title="Doctors awaiting review" />
            <Link to="/admin/doctors" className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400">
              Open queue
            </Link>
          </div>
          {data.pendingDoctors.length ? (
            <div className="divide-y divide-[color:var(--border)]">
              {data.pendingDoctors.map((d) => (
                <button key={d.id} type="button" onClick={() => navigate(`/admin/doctors?review=${d.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle">
                  <Avatar name={d.user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-ink">Dr. {d.user.name}</div>
                    <div className="text-[11px] text-ink-2">
                      {d.specialization} · registered {relative(d.createdAt)}
                    </div>
                  </div>
                  <Badge tone="warning">Review</Badge>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={ShieldAlert} title="Nothing to review" hint="New doctor registrations appear here." />
          )}
        </Panel>
      </div>

      <SectionHeader title="Latest bookings" className="mb-3" />
      <DataTable
        rows={data.recentAppointments}
        onRowClick={(a) => navigate(`/appointments/${a.id}`)}
        maxHeight="none"
        columns={[
          { key: 'created', label: 'Booked', render: (a) => relative(a.createdAt) },
          { key: 'patient', label: 'Patient', render: (a) => a.patient?.name },
          { key: 'doctor', label: 'Doctor', render: (a) => doctorName(a.doctor) },
          { key: 'when', label: 'Appointment', render: (a) => dateTime(a.startAt) },
          { key: 'status', label: 'Status', render: (a) => <AppointmentStatusBadge status={a.status} /> },
          { key: 'commission', label: 'Commission', align: 'right', render: (a) => money(a.commission, currency) }
        ]}
      />
    </>
  );
}

export default function DashboardPage() {
  const { user, refresh } = useAuth();
  const { data, loading, error, reload, setData } = useAsync(() => api.get('/dashboard'), [user.role, user.doctorProfile?.status]);
  // An admin may have approved/rejected this doctor since sign-in: pick up the new status (and menu).
  React.useEffect(() => {
    if (user.role === 'doctor' && data?.profileStatus && data.profileStatus !== user.doctorProfile?.status) refresh().catch(() => {});
  }, [data?.profileStatus, user.role, user.doctorProfile?.status, refresh]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (user.role === 'admin') return <AdminDashboard data={data} />;
  if (user.role === 'doctor') return <DoctorDashboard data={data} user={user} setData={setData} />;
  return <UserDashboard data={data} user={user} setData={setData} />;
}
