import React, { useState } from 'react';
import { CheckCircle2, CalendarClock, XCircle, ClipboardCheck, UserX, ArrowRight, Lock } from 'lucide-react';
import { Button, Modal, Field, Textarea, Spinner, askConfirm } from '../lib/ui';
import api, { errorCode, errorMessage, unwrap } from '../lib/api';
import { toast } from '../lib/toast';
import { dateTime, doctorName } from '../lib/format';
import { Notice } from './common';
import { useAuth } from '../context/AuthContext';

/**
 * The buttons a viewer may use on one appointment. What is allowed comes from the server
 * (`appointment.actions`), so the 24-hour rule and role checks live in one place.
 * `onChange(updated)` receives the fresh appointment after every action.
 */
export default function AppointmentActions({ appointment, onChange, size = 'sm', showLockHint = true }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);
  const a = appointment.actions || {};

  const run = async (key, request, success) => {
    setBusy(key);
    try {
      const updated = unwrap(await request());
      toast.success(success);
      onChange?.(updated);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      // The appointment may have changed underneath us (e.g. moved by the scheduler).
      if (['LOCK_WINDOW', 'INVALID_STATUS', 'CONFIRMATION_CLOSED'].includes(errorCode(err))) {
        api.get(`/appointments/${appointment.id}`).then((r) => onChange?.(unwrap(r)), () => {});
      }
      return false;
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    const ok = await askConfirm(`You will attend the appointment on ${dateTime(appointment.startAt)}.`, { title: 'Confirm attendance?', confirmLabel: 'Yes, I will attend' });
    if (ok) run('confirm', () => api.post(`/appointments/${appointment.id}/confirm`), 'Attendance confirmed');
  };

  const noShow = async () => {
    const ok = await askConfirm('The patient did not attend this appointment.', { title: 'Mark as no-show?', confirmLabel: 'Mark no-show', danger: true });
    if (ok) run('noShow', () => api.post(`/appointments/${appointment.id}/no-show`), 'Marked as no-show');
  };

  const nothing = !Object.values(a).some(Boolean);
  const isPatientLocked = user.role === 'user' && appointment.isLocked && ['pending_confirmation', 'confirmed'].includes(appointment.status);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {a.confirm && (
          <Button size={size} variant="success" icon={CheckCircle2} loading={busy === 'confirm'} onClick={confirm}>
            Confirm
          </Button>
        )}
        {a.reschedule && (
          <Button size={size} icon={CalendarClock} onClick={() => setModal('reschedule')}>
            I can't make it
          </Button>
        )}
        {a.complete && (
          <Button size={size} variant="primary" icon={ClipboardCheck} onClick={() => setModal('complete')}>
            Complete
          </Button>
        )}
        {a.noShow && (
          <Button size={size} icon={UserX} loading={busy === 'noShow'} onClick={noShow}>
            No-show
          </Button>
        )}
        {a.cancel && (
          <Button size={size} variant="ghost" icon={XCircle} className="hover:!text-rose-600" onClick={() => setModal('cancel')}>
            Cancel
          </Button>
        )}
        {nothing && isPatientLocked && showLockHint && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-3" title="Changes are closed within 24 hours of the start time">
            <Lock className="h-3.5 w-3.5" /> Changes closed (within 24 h)
          </span>
        )}
      </div>

      {modal === 'reschedule' && <RescheduleModal appointment={appointment} onClose={() => setModal(null)} onDone={onChange} onCancelInstead={() => setModal('cancel')} />}
      {modal === 'cancel' && (
        <CancelModal
          appointment={appointment}
          reasonRequired={user.role !== 'user'}
          onClose={() => setModal(null)}
          onSubmit={(reason) => run('cancel', () => api.post(`/appointments/${appointment.id}/cancel`, { reason }), 'Appointment cancelled')}
        />
      )}
      {modal === 'complete' && (
        <CompleteModal
          onClose={() => setModal(null)}
          onSubmit={(notes) => run('complete', () => api.post(`/appointments/${appointment.id}/complete`, { notes }), 'Appointment completed')}
        />
      )}
    </>
  );
}

/** "I can't make it": shows the doctor's next free slot and moves the booking there once the patient confirms. */
function RescheduleModal({ appointment, onClose, onDone, onCancelInstead }) {
  const [state, setState] = useState({ loading: true, slot: null, error: null, code: null });
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    api
      .get(`/appointments/${appointment.id}/reschedule-preview`)
      .then((r) => setState({ loading: false, slot: unwrap(r).nextSlot, error: null }))
      .catch((err) => setState({ loading: false, slot: null, error: errorMessage(err), code: errorCode(err) }));
  }, [appointment.id]);

  const submit = async () => {
    setSaving(true);
    try {
      const updated = unwrap(await api.post(`/appointments/${appointment.id}/reschedule`, { slotId: state.slot.id }));
      toast.success(`Moved to ${dateTime(updated.startAt)}`);
      onDone?.(updated);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      if (errorCode(err) === 'SLOT_UNAVAILABLE') {
        // Someone took it meanwhile: look for the next one again.
        setState({ loading: true, slot: null, error: null });
        api
          .get(`/appointments/${appointment.id}/reschedule-preview`)
          .then((r) => setState({ loading: false, slot: unwrap(r).nextSlot, error: null }))
          .catch((e) => setState({ loading: false, slot: null, error: errorMessage(e), code: errorCode(e) }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Move to the next available slot"
      subtitle={`With ${doctorName(appointment.doctor)}`}
      footer={
        <>
          <Button onClick={onClose}>Keep current time</Button>
          {state.slot && (
            <Button variant="primary" loading={saving} onClick={submit}>
              Move appointment
            </Button>
          )}
        </>
      }
    >
      {state.loading ? (
        <Spinner label="Finding the next free slot…" />
      ) : state.error ? (
        <Notice
          tone="warning"
          title={state.code === 'NO_SLOT_AVAILABLE' ? 'No later slot available' : 'Cannot reschedule'}
          action={
            state.code === 'NO_SLOT_AVAILABLE' && appointment.actions?.cancel ? (
              <Button size="sm" variant="danger" onClick={onCancelInstead}>
                Cancel instead
              </Button>
            ) : null
          }
        >
          {state.error}
        </Notice>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="rounded-xl border border-line bg-subtle p-3">
              <div className="label-eyebrow">Current</div>
              <div className="mt-1 text-[13px] font-bold text-ink line-through decoration-rose-400/70">{dateTime(appointment.startAt)}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-3" />
            <div className="rounded-xl border border-indigo-300 bg-accent-soft p-3 dark:border-indigo-800">
              <div className="label-eyebrow">New</div>
              <div className="mt-1 text-[13px] font-bold text-ink">{dateTime(state.slot.startAt)}</div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-ink-2">
            Your fee stays the same. The new time is treated as confirmed. Remember that changes are not possible within 24 hours of an appointment.
          </p>
        </div>
      )}
    </Modal>
  );
}

function CancelModal({ appointment, reasonRequired, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const ok = await onSubmit(reason.trim());
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Cancel appointment"
      subtitle={dateTime(appointment.startAt)}
      footer={
        <>
          <Button onClick={onClose}>Keep appointment</Button>
          <Button variant="danger" loading={saving} disabled={reasonRequired && !reason.trim()} onClick={submit}>
            Cancel appointment
          </Button>
        </>
      }
    >
      <Field label="Reason" required={reasonRequired} hint={reasonRequired ? 'The patient will see this.' : 'Optional — helps the doctor plan.'}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Travelling that week" autoFocus />
      </Field>
    </Modal>
  );
}

function CompleteModal({ onClose, onSubmit }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const ok = await onSubmit(notes.trim() || null);
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Complete appointment"
      subtitle="The patient is notified that the visit is complete."
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            Mark completed
          </Button>
        </>
      }
    >
      <Field label="Private notes" hint="Only visible to you. Add the prescription from the appointment page.">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={2000} />
      </Field>
    </Modal>
  );
}
