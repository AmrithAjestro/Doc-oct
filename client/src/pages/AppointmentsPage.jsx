import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CalendarDays, Eye, FileText } from 'lucide-react';
import { PageHeader, Toolbar, SegmentedControl, Select, SearchInput, DataTable, EmptyState, RowAction, Button } from '../lib/ui';
import { AppointmentStatusBadge, ErrorBanner, Pagination } from '../components/common';
import AppointmentActions from '../components/AppointmentActions';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import api from '../lib/api';
import { APPOINTMENT_STATUS, dateTime, doctorName, money, relative } from '../lib/format';

const SCOPES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' }
];

export default function AppointmentsPage() {
  const { user } = useAuth();
  const { currency } = useBranding();
  const navigate = useNavigate();
  const [scope, setScope] = useState('upcoming');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [scope, status, q]);

  const { data, meta, loading, error, reload, setData } = useAsync(
    () => api.get('/appointments', { params: { scope, status: status || undefined, search: q || undefined, page, limit: 15 } }),
    [scope, status, q, page]
  );

  const replace = (updated) => setData((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));

  const isPatient = user.role === 'user';
  const columns = [
    {
      key: 'when',
      label: 'When',
      render: (a) => (
        <div>
          <div className="font-semibold text-ink">{dateTime(a.startAt)}</div>
          <div className="text-[11px] text-ink-3">{relative(a.startAt)}</div>
        </div>
      )
    },
    ...(user.role !== 'doctor'
      ? [
          {
            key: 'doctor',
            label: 'Doctor',
            render: (a) => (
              <div>
                <div className="font-semibold">{doctorName(a.doctor)}</div>
                <div className="text-[11px] text-ink-3">{a.doctor?.specialization}</div>
              </div>
            )
          }
        ]
      : []),
    ...(user.role !== 'user'
      ? [
          {
            key: 'patient',
            label: 'Patient',
            render: (a) => (
              <div>
                <div className="font-semibold">{a.patient?.name}</div>
                <div className="text-[11px] text-ink-3">{a.patient?.phone || a.patient?.email}</div>
              </div>
            )
          }
        ]
      : []),
    {
      key: 'status',
      label: 'Status',
      render: (a) => (
        <div className="flex items-center gap-1.5">
          <AppointmentStatusBadge status={a.status} />
          {a.prescription && <FileText className="h-3.5 w-3.5 text-emerald-600" aria-label="Prescription available" />}
        </div>
      )
    },
    {
      key: 'fee',
      label: user.role === 'doctor' ? 'Your fee' : 'Total',
      align: 'right',
      render: (a) => money(user.role === 'doctor' ? a.doctorFee : a.totalFee, currency)
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (a) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <AppointmentActions appointment={a} onChange={replace} showLockHint={false} />
          <RowAction icon={Eye} label="Open" tone="accent" onClick={() => navigate(`/appointments/${a.id}`)} />
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title={isPatient ? 'My appointments' : 'Appointments'}
        subtitle={isPatient ? 'Confirm, reschedule or cancel up to 24 hours before the start.' : undefined}
        actions={
          isPatient && (
            <Link to="/doctors">
              <Button variant="primary">Book new</Button>
            </Link>
          )
        }
      />
      <Toolbar className="mb-4">
        <SegmentedControl options={SCOPES} value={scope} onChange={setScope} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          <option value="">Any status</option>
          {Object.entries(APPOINTMENT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        {!isPatient && <SearchInput value={search} onChange={setSearch} placeholder="Search patient or doctor…" className="min-w-[220px] flex-1" />}
      </Toolbar>
      <ErrorBanner message={error} onRetry={reload} />
      <DataTable
        columns={columns}
        rows={data || []}
        loading={loading}
        onRowClick={(a) => navigate(`/appointments/${a.id}`)}
        maxHeight="none"
        empty={
          <EmptyState
            icon={CalendarDays}
            title={scope === 'upcoming' ? 'No upcoming appointments' : 'No appointments here'}
            hint={isPatient ? 'Find a doctor and book a free slot.' : 'Bookings will appear here.'}
            action={
              isPatient && (
                <Link to="/doctors">
                  <Button variant="primary">Find a doctor</Button>
                </Link>
              )
            }
          />
        }
      />
      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}
