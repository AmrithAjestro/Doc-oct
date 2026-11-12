import React, { useEffect, useState } from 'react';
import { Users as UsersIcon } from 'lucide-react';
import { PageHeader, Toolbar, SegmentedControl, Select, SearchInput, DataTable, EmptyState, Badge, Switch, askConfirm } from '../../lib/ui';
import { Avatar, DoctorStatusBadge, ErrorBanner, Pagination } from '../../components/common';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../context/AuthContext';
import api, { errorMessage, unwrap } from '../../lib/api';
import { toast } from '../../lib/toast';
import { dateOnly, ROLE_LABEL } from '../../lib/format';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [role, status, q]);

  const { data, meta, loading, error, reload, setData } = useAsync(
    () => api.get('/admin/users', { params: { role: role || undefined, status: status || undefined, search: q || undefined, page } }),
    [role, status, q, page]
  );

  const toggle = async (u, isActive) => {
    if (!isActive) {
      const ok = await askConfirm(
        `${u.name} will not be able to sign in. Their upcoming appointments will be cancelled and the other party notified.`,
        { title: 'Deactivate account?', confirmLabel: 'Deactivate', danger: true }
      );
      if (!ok) return;
    }
    setBusy(u.id);
    try {
      const res = unwrap(await api.patch(`/admin/users/${u.id}/status`, { isActive }));
      setData((rows) => rows.map((r) => (r.id === u.id ? { ...r, isActive } : r)));
      toast.success(`${u.name} ${isActive ? 'reactivated' : 'deactivated'}${res.cancelledAppointments ? ` · ${res.cancelledAppointments} appointments cancelled` : ''}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Users" subtitle="Everyone with an account. Deactivated users cannot sign in." />
      <Toolbar className="mb-4">
        <SegmentedControl
          options={[
            { value: '', label: 'All' },
            { value: 'user', label: 'Patients' },
            { value: 'doctor', label: 'Doctors' },
            { value: 'admin', label: 'Admins' }
          ]}
          value={role}
          onChange={setRole}
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or phone…" className="min-w-[220px] flex-1" />
      </Toolbar>
      <ErrorBanner message={error} onRetry={reload} />
      <DataTable
        rows={data || []}
        loading={loading}
        maxHeight="none"
        empty={<EmptyState icon={UsersIcon} title="No users found" />}
        columns={[
          {
            key: 'name',
            label: 'Name',
            render: (u) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={u.name} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{u.role === 'doctor' ? `Dr. ${u.name}` : u.name}</div>
                  <div className="truncate text-[11px] text-ink-3">{u.email}</div>
                </div>
              </div>
            )
          },
          { key: 'phone', label: 'Phone', render: (u) => u.phone || <span className="text-ink-3">—</span> },
          {
            key: 'role',
            label: 'Role',
            render: (u) => (
              <div className="flex items-center gap-1.5">
                <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>
                {u.doctorProfile && <DoctorStatusBadge status={u.doctorProfile.status} />}
              </div>
            )
          },
          { key: 'joined', label: 'Joined', render: (u) => dateOnly(u.createdAt) },
          {
            key: 'active',
            label: 'Active',
            align: 'right',
            render: (u) => (
              <div className="flex justify-end">
                <Switch checked={u.isActive} onChange={(v) => toggle(u, v)} label={`${u.isActive ? 'Deactivate' : 'Activate'} ${u.name}`} disabled={busy === u.id || u.id === me.id} />
              </div>
            )
          }
        ]}
      />
      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}
