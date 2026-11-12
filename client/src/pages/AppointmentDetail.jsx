import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, AlertTriangle, CheckCircle2, CalendarClock, XCircle, Lock, Phone, Mail, MapPin } from 'lucide-react';
import { Panel, SectionHeader, Spinner } from '../lib/ui';
import { AppointmentStatusBadge, Avatar, ErrorBanner, FeeBreakdown, Notice } from '../components/common';
import AppointmentActions from '../components/AppointmentActions';
import { PrescriptionForm, PrescriptionView } from '../components/Prescription';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { useBranding } from '../context/BrandingContext';
import { dateTime, doctorName, money, relative, timeOnly } from '../lib/format';

function StatusNotice({ a, role }) {
  if (a.status === 'pending_confirmation') {
    return role === 'user' ? (
      <Notice tone="warning" icon={AlertTriangle} title="Please confirm your attendance">
        Confirm before <b>{dateTime(a.confirmBy)}</b> ({relative(a.confirmBy)}). If it is not confirmed by then, the appointment is moved automatically to the doctor’s next free slot.
      </Notice>
    ) : (
      <Notice tone="warning" icon={AlertTriangle} title="Awaiting patient confirmation">
        The patient must confirm by {dateTime(a.confirmBy)}, otherwise it moves to your next free slot.
      </Notice>
    );
  }
  if (a.status === 'confirmed' && a.isLocked && role === 'user' && new Date(a.startAt) > new Date()) {
    return (
      <Notice tone="info" icon={Lock}>
        This appointment starts {relative(a.startAt)}. Changes are not possible within 24 hours of the start.
      </Notice>
    );
  }
  if (a.status === 'cancelled') {
    return (
      <Notice tone="danger" icon={XCircle} title={`Cancelled ${a.cancelledBy === 'system' ? 'automatically' : `by the ${a.cancelledBy === 'user' ? 'patient' : a.cancelledBy}`}`}>
        {a.cancelReason || 'No reason given.'}
      </Notice>
    );
  }
  if (a.status === 'completed') return <Notice tone="success" icon={CheckCircle2} title="Visit completed" />;
  return null;
}

function Timeline({ a }) {
  const items = [
    { at: a.createdAt, label: 'Booked', icon: CalendarClock },
    a.previousStartAt && { at: a.updatedAt, label: `Rescheduled from ${dateTime(a.previousStartAt)}${a.autoRescheduleCount ? ' (automatically)' : ''}`, icon: CalendarClock },
    a.confirmedAt && { at: a.confirmedAt, label: 'Attendance confirmed', icon: CheckCircle2 },
    a.completedAt && { at: a.completedAt, label: 'Completed', icon: CheckCircle2 },
    a.cancelledAt && { at: a.cancelledAt, label: 'Cancelled', icon: XCircle }
  ]
    .filter(Boolean)
    .sort((x, y) => new Date(x.at) - new Date(y.at));
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle">
            <it.icon className="h-3.5 w-3.5 text-ink-3" />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-ink">{it.label}</div>
            <div className="text-[11px] text-ink-3">{dateTime(it.at)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Person({ title, name, sub, phone, email, address }) {
  return (
    <div>
      <div className="label-eyebrow mb-2">{title}</div>
      <div className="flex items-start gap-3">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 space-y-0.5 text-[13px]">
          <div className="font-bold text-ink">{name}</div>
          {sub && <div className="text-xs text-ink-2">{sub}</div>}
          {phone && (
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <Phone className="h-3 w-3" /> {phone}
            </div>
          )}
          {email && (
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <Mail className="h-3 w-3" /> {email}
            </div>
          )}
          {address && (
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <MapPin className="h-3 w-3" /> {address}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppointmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { currency } = useBranding();
  const { data: a, loading, error, reload, setData } = useAsync(() => api.get(`/appointments/${id}`), [id]);

  if (loading && !a) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;

  const isDoctor = user.role === 'doctor';

  return (
    <div>
      <Link to="/appointments" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-2 hover:text-ink print:hidden">
        <ArrowLeft className="h-3.5 w-3.5" /> Appointments
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <AppointmentStatusBadge status={a.status} />
            <span className="text-[11px] font-semibold text-ink-3">{relative(a.startAt)}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{dateTime(a.startAt)}</h1>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
            <Clock className="h-3.5 w-3.5" /> {timeOnly(a.startAt)} – {timeOnly(a.endAt)}
          </div>
        </div>
        <div className="print:hidden">
          <AppointmentActions appointment={a} onChange={setData} size="md" />
        </div>
      </div>

      <div className="mb-5 print:hidden">
        <StatusNotice a={a} role={user.role} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Panel>
            <div className="grid gap-5 sm:grid-cols-2">
              {user.role !== 'doctor' && (
                <Person
                  title="Doctor"
                  name={doctorName(a.doctor)}
                  sub={[a.doctor?.specialization, a.doctor?.qualification].filter(Boolean).join(' · ')}
                  address={a.doctor?.clinicAddress}
                />
              )}
              {user.role !== 'user' && <Person title="Patient" name={a.patient?.name} phone={a.patient?.phone} email={a.patient?.email} />}
              <div>
                <div className="label-eyebrow mb-2">Reason for visit</div>
                <p className="text-[13px] leading-relaxed text-ink">{a.reason || <span className="text-ink-3">Not given</span>}</p>
              </div>
              {isDoctor && a.doctorNotes && (
                <div>
                  <div className="label-eyebrow mb-2">Your private notes</div>
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">{a.doctorNotes}</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Prescription" className="mb-4" />
            {a.actions?.prescribe ? (
              <PrescriptionForm key={a.prescription?.updatedAt || 'new'} appointmentId={a.id} prescription={a.prescription} onSaved={setData} />
            ) : (
              <PrescriptionView prescription={a.prescription} />
            )}
            {isDoctor && !a.actions?.prescribe && !a.prescription && ['pending_confirmation', 'confirmed'].includes(a.status) && (
              <p className="mt-2 text-center text-xs text-ink-3">You can add a prescription once the appointment has started.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionHeader title="Payment" subtitle="Price fixed at booking time" className="mb-3" />
            {isDoctor ? (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-2">Your consultation fee</span>
                <span className="tabular font-bold text-ink">{money(a.doctorFee, currency)}</span>
              </div>
            ) : (
              <FeeBreakdown doctorFee={a.doctorFee} commission={a.commission} totalFee={a.totalFee} />
            )}
          </Panel>
          <Panel className="print:hidden">
            <SectionHeader title="History" className="mb-4" />
            <Timeline a={a} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
