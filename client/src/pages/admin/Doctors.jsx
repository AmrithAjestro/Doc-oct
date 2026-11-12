import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Stethoscope, CheckCircle2, XCircle, ExternalLink, Eye } from 'lucide-react';
import { PageHeader, Toolbar, SegmentedControl, SearchInput, DataTable, EmptyState, Drawer, Button, Field, Textarea, Spinner, RowAction, askConfirm } from '../../lib/ui';
import { Avatar, DoctorStatusBadge, ErrorBanner, Notice, Pagination } from '../../components/common';
import { useAsync } from '../../lib/useAsync';
import { useCounts } from '../../components/AppShell';
import { useBranding } from '../../context/BrandingContext';
import api, { errorMessage, unwrap } from '../../lib/api';
import { certificateUrl } from '../../lib/files';
import { toast } from '../../lib/toast';
import { APPOINTMENT_STATUS, dateTime, money, relative } from '../../lib/format';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' }
];

function CertificatePreview({ doctorId }) {
  const [file, setFile] = useState({ loading: true });
  useEffect(() => {
    let url;
    certificateUrl(doctorId)
      .then((f) => {
        url = f.url;
        setFile(f);
      })
      .catch((err) => setFile({ error: errorMessage(err) }));
    return () => url && URL.revokeObjectURL(url);
  }, [doctorId]);

  if (file.loading) return <Spinner label="Loading certificate…" />;
  if (file.error) return <Notice tone="danger">{file.error}</Notice>;
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-line bg-subtle">
        {file.type === 'application/pdf' ? (
          <iframe src={file.url} title="Certificate" className="h-[420px] w-full" />
        ) : (
          <img src={file.url} alt="Certificate" className="max-h-[420px] w-full object-contain" />
        )}
      </div>
      <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400">
        Open in new tab <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function ReviewDrawer({ doctorId, onClose, onChanged }) {
  const { currency } = useBranding();
  const { data: d, loading, error, reload } = useAsync(() => (doctorId ? api.get(`/admin/doctors/${doctorId}`) : Promise.resolve(null)), [doctorId]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(null);

  useEffect(() => setReason(''), [doctorId]);

  const decide = async (status) => {
    if (status === 'rejected' && d.status === 'approved') {
      const ok = await askConfirm('The doctor will be hidden from patients and all their upcoming appointments will be cancelled (patients are notified).', {
        title: 'Revoke approval?',
        confirmLabel: 'Revoke',
        danger: true
      });
      if (!ok) return;
    }
    setSaving(status);
    try {
      const res = unwrap(await api.patch(`/admin/doctors/${doctorId}/status`, { status, reason: reason.trim() || null }));
      toast.success(
        status === 'approved'
          ? `Dr. ${d.user.name} approved`
          : `Dr. ${d.user.name} rejected${res.cancelledAppointments ? ` · ${res.cancelledAppointments} appointments cancelled` : ''}`
      );
      onChanged();
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const info = (label, value) => (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className="mt-0.5 text-[13px] text-ink">{value || <span className="text-ink-3">—</span>}</div>
    </div>
  );

  return (
    <Drawer
      open={Boolean(doctorId)}
      onClose={onClose}
      size="lg"
      title={d ? `Dr. ${d.user.name}` : 'Doctor'}
      subtitle={d ? `${d.specialization} · registered ${relative(d.createdAt)}` : undefined}
      footer={
        d && (
          <>
            {d.status !== 'rejected' && (
              <Button variant="danger" icon={XCircle} loading={saving === 'rejected'} disabled={!reason.trim()} onClick={() => decide('rejected')} title={!reason.trim() ? 'Enter a reason first' : undefined}>
                {d.status === 'approved' ? 'Revoke approval' : 'Reject'}
              </Button>
            )}
            {d.status !== 'approved' && (
              <Button variant="success" icon={CheckCircle2} loading={saving === 'approved'} disabled={!d.hasCertificate} onClick={() => decide('approved')}>
                Approve
              </Button>
            )}
          </>
        )
      }
    >
      {loading && !d ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner message={error} onRetry={reload} />
      ) : (
        d && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={d.user.name} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink-2">{d.user.email}</div>
                <div className="text-[13px] text-ink-2">{d.user.phone || 'No phone'}</div>
              </div>
              <DoctorStatusBadge status={d.status} />
            </div>
            {d.status === 'rejected' && d.rejectionReason && <Notice tone="danger" title="Rejection reason">{d.rejectionReason}</Notice>}
            {d.reviewedAt && (
              <p className="text-[11px] text-ink-3">
                Last reviewed {dateTime(d.reviewedAt)}
                {d.reviewer ? ` by ${d.reviewer.name}` : ''}
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              {info('Qualification', d.qualification)}
              {info('Experience', `${d.experienceYears} years`)}
              {info('Consultation fee', money(d.fee, currency))}
              {info('Clinic', d.clinicAddress)}
            </div>
            {d.bio && info('About', d.bio)}
            {Object.keys(d.appointmentStats || {}).length > 0 && (
              <div className="flex flex-wrap gap-3 text-[12px] text-ink-2">
                {Object.entries(d.appointmentStats).map(([k, n]) => (
                  <span key={k}>
                    <b className="text-ink">{n}</b> {APPOINTMENT_STATUS[k]?.label.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
            <div>
              <div className="label-eyebrow mb-2">Registration certificate {d.certificateName && `· ${d.certificateName}`}</div>
              {d.hasCertificate ? <CertificatePreview doctorId={d.id} /> : <Notice tone="warning">No certificate uploaded — cannot be approved.</Notice>}
            </div>
            {d.status !== 'rejected' && (
              <Field label={d.status === 'approved' ? 'Reason for revoking' : 'Reason (required to reject)'} hint="Sent to the doctor.">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="e.g. The certificate is not legible" />
              </Field>
            )}
          </div>
        )
      )}
    </Drawer>
  );
}

export default function AdminDoctors() {
  const { currency } = useBranding();
  const { refreshCounts } = useCounts();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const reviewId = params.get('review');

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, q]);

  const { data, meta, loading, error, reload } = useAsync(() => api.get('/admin/doctors', { params: { status: status || undefined, search: q || undefined, page } }), [status, q, page]);
  const openReview = (id) => setParams(id ? { review: id } : {});

  return (
    <div>
      <PageHeader title="Doctors" subtitle="Verify certificates before doctors can publish slots and take bookings." />
      <Toolbar className="mb-4">
        <SegmentedControl options={FILTERS} value={status} onChange={setStatus} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or specialization…" className="min-w-[220px] flex-1" />
      </Toolbar>
      <ErrorBanner message={error} onRetry={reload} />
      <DataTable
        rows={data || []}
        loading={loading}
        maxHeight="none"
        onRowClick={(d) => openReview(d.id)}
        empty={<EmptyState icon={Stethoscope} title={status === 'pending' ? 'No doctors waiting for review' : 'No doctors found'} />}
        columns={[
          {
            key: 'name',
            label: 'Doctor',
            render: (d) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={d.user.name} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-semibold">Dr. {d.user.name}</div>
                  <div className="truncate text-[11px] text-ink-3">{d.user.email}</div>
                </div>
              </div>
            )
          },
          { key: 'spec', label: 'Specialization', render: (d) => d.specialization },
          { key: 'fee', label: 'Fee', align: 'right', render: (d) => money(d.fee, currency) },
          { key: 'registered', label: 'Registered', render: (d) => relative(d.createdAt) },
          { key: 'status', label: 'Status', render: (d) => <DoctorStatusBadge status={d.status} /> },
          { key: 'actions', label: '', align: 'right', render: (d) => <RowAction icon={Eye} label="Review" tone="accent" onClick={() => openReview(d.id)} /> }
        ]}
      />
      <Pagination meta={meta} onPage={setPage} />
      <ReviewDrawer
        doctorId={reviewId}
        onClose={() => openReview(null)}
        onChanged={() => {
          reload();
          refreshCounts();
        }}
      />
    </div>
  );
}
