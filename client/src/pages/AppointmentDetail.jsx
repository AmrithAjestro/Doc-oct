import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, AlertTriangle, CheckCircle2, CalendarClock, XCircle, Lock } from 'lucide-react';
import { Panel, SectionHeader, Spinner, Button, Field, Textarea } from '../lib/ui';
import { AppointmentStatusBadge, Avatar, ErrorBanner, FeeBreakdown, Notice, Stars } from '../components/common';
import AppointmentActions from '../components/AppointmentActions';
import { VisitBadges } from '../components/WalkIn';
import { PrescriptionForm, PrescriptionView } from '../components/Prescription';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage, unwrap } from '../lib/api';
import { toast } from '../lib/toast';
import { useBranding } from '../context/BrandingContext';
import { dateTime, doctorName, money, relative, timeOnly } from '../lib/format';

function StatusNotice({ a, role }) {
  if (a.delayNotifiedAt && ['pending_confirmation', 'confirmed'].includes(a.status) && new Date(a.endAt) > new Date()) {
    return role === 'user' ? (
      <Notice tone="warning" icon={AlertTriangle} title="Your doctor is running late">
        {doctorName(a.doctor)} is attending an emergency, so your visit may start about {a.delayMinutes} minutes late. Your booking is kept. If the delay does not suit you, you can move or cancel it below; the 24-hour rule does not apply.
      </Notice>
    ) : (
      <Notice tone="info" icon={CalendarClock} title={`Patient told you are about ${a.delayMinutes} minutes late`}>
        They may move or cancel this visit.
      </Notice>
    );
  }
  if (a.awaitingPatientReply && a.status !== 'cancelled') {
    return role === 'user' ? (
      <Notice tone="warning" icon={AlertTriangle} title="Your doctor had to move this visit">
        {doctorName(a.doctor)} could not see you{a.previousStartAt ? ` at ${dateTime(a.previousStartAt)}` : ''}
        {a.doctorMoveReason ? ` (${a.doctorMoveReason})` : ''}. The new time is <b>{dateTime(a.startAt)}</b>, same price. Accept it, choose another time or cancel; the 24-hour rule does not apply here.
      </Notice>
    ) : (
      <Notice tone="info" icon={CalendarClock} title="Waiting for the patient to accept the new time">
        Moved from {dateTime(a.previousStartAt)}. The new time stands unless the patient changes or cancels it.
      </Notice>
    );
  }
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
    { at: a.createdAt, label: a.visitType === 'walk_in' ? 'Seen as a walk-in' : 'Booked', icon: CalendarClock },
    a.previousStartAt && { at: a.updatedAt, label: `Rescheduled from ${dateTime(a.previousStartAt)}${a.doctorMoveReason ? ' by the doctor' : a.autoRescheduleCount ? ' (automatically)' : ''}`, icon: CalendarClock },
    a.confirmedAt && a.visitType !== 'walk_in' && { at: a.confirmedAt, label: 'Attendance confirmed', icon: CheckCircle2 },
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
            <div className="text-[14px] font-medium text-ink">{it.label}</div>
            <div className="text-[12.5px] text-ink-3">{dateTime(it.at)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** After a completed visit the patient can rate it; the rating shows on the doctor's profile. */
function ReviewBox({ a, onSaved }) {
  const [editing, setEditing] = useState(!a.review);
  const [rating, setRating] = useState(a.review?.rating || 0);
  const [comment, setComment] = useState(a.review?.comment || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      onSaved(unwrap(await api.put(`/appointments/${a.id}/review`, { rating, comment: comment.trim() || null })));
      toast.success(a.review ? 'Review updated' : 'Thanks! Your review is published.');
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  if (!editing && a.review) {
    return (
      <Panel>
        <SectionHeader title="Your review" actions={<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>} />
        <div className="mt-3"><Stars value={a.review.rating} /></div>
        {a.review.comment && <p className="mt-2 text-[14px] leading-relaxed text-ink">{a.review.comment}</p>}
      </Panel>
    );
  }
  return (
    <Panel className="space-y-4">
      <SectionHeader title={`How was your visit with ${doctorName(a.doctor)}?`} subtitle="Your rating and first name are shown on the doctor's profile." />
      <Stars value={rating} onChange={setRating} size="lg" />
      <Field label="Comment" hint="Optional">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} placeholder="What went well? What could be better?" />
      </Field>
      <div className="flex justify-end gap-2">
        {a.review && <Button variant="ghost" onClick={() => setEditing(false)}>Keep current review</Button>}
        <Button variant="primary" loading={saving} disabled={!rating} onClick={save}>
          {a.review ? 'Update review' : 'Publish review'}
        </Button>
      </div>
    </Panel>
  );
}

export default function AppointmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { currency } = useBranding();
  const { data: a, loading, error, reload, setData } = useAsync(() => api.get(`/appointments/${id}`), [id], { live: true });

  if (loading && !a) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;

  const isDoctor = user.role === 'doctor';

  const other = isDoctor
    ? { name: a.patient?.name, lines: [a.patient?.phone, a.patient?.email].filter(Boolean) }
    : { name: doctorName(a.doctor), photoUrl: a.doctor?.photoUrl, lines: [[a.doctor?.specialization, a.doctor?.qualification].filter(Boolean).join(', '), a.doctor?.clinicAddress].filter(Boolean) };

  // Only show the action bar when there is something to do (or the 24-hour lock to explain).
  const hasActions =
    ['confirm', 'reschedule', 'cancel', 'complete', 'noShow'].some((k) => a.actions?.[k]) ||
    (user.role === 'user' && a.isLocked && ['pending_confirmation', 'confirmed'].includes(a.status));

  return (
    <div>
      <Link to="/appointments" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink print:hidden">
        <ArrowLeft className="h-4 w-4" /> Appointments
      </Link>

      {/* Summary: everything needed at a glance, with the next action. */}
      <Panel className="mb-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <AppointmentStatusBadge status={a.status} />
              <VisitBadges a={a} />
              <span className="text-[13px] text-ink-2">{relative(a.startAt)}</span>
            </div>
            <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]">{dateTime(a.startAt)}</h1>
            <div className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-2">
              <Clock className="h-4 w-4" /> {timeOnly(a.startAt)} to {timeOnly(a.endAt)}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-4 lg:w-[360px] lg:border-l lg:border-line lg:pl-6">
            <Avatar name={other.name} photoUrl={other.photoUrl} size="lg" />
            <div className="min-w-0">
              <div className="text-[13px] text-ink-3">{isDoctor ? 'Patient' : 'Doctor'}</div>
              <div className="truncate text-[17px] font-semibold text-ink">{other.name}</div>
              {other.lines.map((l) => (
                <div key={l} className="truncate text-[13.5px] text-ink-2">{l}</div>
              ))}
            </div>
          </div>
          <div className="lg:w-[150px] lg:text-right">
            <div className="text-[13px] text-ink-3">{isDoctor ? 'Your fee' : 'Total'}</div>
            <div className="tabular text-[22px] font-semibold text-ink">{money(isDoctor ? a.doctorFee : a.totalFee, currency)}</div>
          </div>
        </div>
        {hasActions && (
          <div className="mt-5 border-t border-line pt-4 print:hidden">
            <AppointmentActions appointment={a} onChange={setData} size="md" />
          </div>
        )}
      </Panel>

      <div className="mb-5 print:hidden empty:hidden">
        <StatusNotice a={a} role={user.role} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {a.actions?.review && <ReviewBox a={a} onSaved={setData} />}

          <Panel>
            <SectionHeader title="Prescription" className="mb-4" />
            {a.actions?.prescribe ? (
              <PrescriptionForm key={a.prescription?.updatedAt || 'new'} appointmentId={a.id} prescription={a.prescription} onSaved={setData} />
            ) : a.prescription ? (
              <PrescriptionView prescription={a.prescription} />
            ) : (
              <p className="text-[14px] text-ink-2">
                {isDoctor && ['pending_confirmation', 'confirmed'].includes(a.status)
                  ? 'You can add a prescription once the appointment has started.'
                  : 'No prescription yet. The doctor adds it during or after the visit.'}
              </p>
            )}
          </Panel>

          <Panel>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h2 className="mb-1.5 text-[15px] font-semibold text-ink">Reason for visit</h2>
                <p className="text-[14px] leading-relaxed text-ink">{a.reason || <span className="text-ink-3">Not given</span>}</p>
              </div>
              {isDoctor && a.doctorNotes && (
                <div>
                  <h2 className="mb-1.5 text-[15px] font-semibold text-ink">Your private notes</h2>
                  <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{a.doctorNotes}</p>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionHeader title="Payment" subtitle={a.visitType === 'walk_in' ? "Walk-in: doctor's fee only, no platform fee" : 'Price fixed at booking time'} className="mb-3" />
            {isDoctor ? (
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-ink-2">Your consultation fee</span>
                <span className="tabular font-semibold text-ink">{money(a.doctorFee, currency)}</span>
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
