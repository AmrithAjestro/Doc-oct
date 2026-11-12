import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren, BellRing } from 'lucide-react';
import { Button, Modal, Field, Input, Textarea, Select } from '../lib/ui';
import { Notice } from './common';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage, unwrap } from '../lib/api';
import { toast } from '../lib/toast';
import { timeOnly } from '../lib/format';
import { isEmail, phoneProblem } from '../lib/validation';

/**
 * "Walk-in / emergency": a patient seen at the clinic without a booking. The visit starts now, so
 * the doctor can complete it and write a prescription straight away. If booked patients are due
 * during it, the doctor can tell them about the delay in one step.
 */
export default function WalkInButton({ onRecorded }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [affected, setAffected] = useState(null); // { appointmentId, list }
  const [delay, setDelay] = useState(30);

  const start = () => {
    setForm({ name: '', phone: '', email: '', reason: '', isEmergency: true, fee: String(user.doctorProfile?.fee ?? ''), durationMinutes: 30 });
    setOpen(true);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const problem = form && (form.name.trim().length < 2 ? 'Enter the patient name' : !form.phone.trim() ? 'Enter a phone number' : phoneProblem(form.phone) || (form.email && !isEmail(form.email) && 'Enter a valid e-mail'));

  const submit = async () => {
    setSaving(true);
    try {
      const res = unwrap(
        await api.post('/appointments/walk-in', {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          reason: form.reason.trim() || null,
          isEmergency: form.isEmergency,
          fee: form.fee === '' ? undefined : Number(form.fee),
          durationMinutes: Number(form.durationMinutes)
        })
      );
      setOpen(false);
      toast.success(res.patientCreated ? 'Visit started. A patient record was created.' : 'Visit started for the existing patient.');
      onRecorded?.();
      if (res.affected.length) setAffected({ appointmentId: res.appointmentId, list: res.affected });
      else navigate(`/appointments/${res.appointmentId}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const notify = async () => {
    setSaving(true);
    try {
      const { notified } = unwrap(await api.post('/appointments/notify-delay', { appointmentIds: affected.list.map((a) => a.id), minutes: Number(delay) }));
      toast.success(`${notified} ${notified === 1 ? 'patient' : 'patients'} told about the delay`);
      refresh().catch(() => {});
      const id = affected.appointmentId;
      setAffected(null);
      navigate(`/appointments/${id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="danger" icon={Siren} onClick={start}>
        Walk-in / emergency
      </Button>

      {open && form && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Walk-in / emergency visit"
          subtitle="For a patient at the clinic without a booking. The visit starts now."
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Back</Button>
              <Button variant="primary" loading={saving} disabled={Boolean(problem)} onClick={submit}>
                Start visit
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[14px] font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <input type="checkbox" checked={form.isEmergency} onChange={(e) => setForm({ ...form, isEmergency: e.target.checked })} className="h-4 w-4 accent-rose-600" />
              Emergency case
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Patient name" required>
                <Input value={form.name} onChange={set('name')} autoFocus />
              </Field>
              <Field label="Phone" required hint="Finds the patient if they already have an account">
                <Input value={form.phone} onChange={set('phone')} inputMode="tel" />
              </Field>
            </div>
            <Field label="E-mail" hint="Optional. With an e-mail the patient can later sign in with &quot;Forgot password&quot; and see this visit.">
              <Input type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Reason">
              <Textarea value={form.reason} onChange={set('reason')} rows={2} maxLength={500} placeholder="e.g. High fever and breathlessness" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fee" hint="Your fee only, no platform fee">
                <Input type="number" min="0" value={form.fee} onChange={set('fee')} />
              </Field>
              <Field label="Expected length">
                <Select value={form.durationMinutes} onChange={set('durationMinutes')}>
                  {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {problem && form.name && <p className="text-[13px] font-medium text-rose-600">{problem}</p>}
          </div>
        </Modal>
      )}

      {affected && (
        <Modal
          open
          onClose={() => navigate(`/appointments/${affected.appointmentId}`)}
          title="Booked patients will be affected"
          subtitle="Their bookings are kept. Let them know you are running late."
          footer={
            <>
              <Button onClick={() => navigate(`/appointments/${affected.appointmentId}`)}>Don't notify</Button>
              <Button variant="primary" icon={BellRing} loading={saving} onClick={notify}>
                Notify {affected.list.length === 1 ? 'patient' : `${affected.list.length} patients`}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <ul className="divide-y divide-line rounded-xl border border-line">
              {affected.list.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-3 py-2.5 text-[14px]">
                  <span className="font-medium text-ink">{a.patientName}</span>
                  <span className="tabular text-ink-2">{timeOnly(a.startAt)}</span>
                </li>
              ))}
            </ul>
            <Field label="Expected delay">
              <Select value={delay} onChange={(e) => setDelay(e.target.value)}>
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    About {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Notice tone="info">If you can't see one of them at all, open their appointment and use "Can't attend" to move it.</Notice>
          </div>
        </Modal>
      )}
    </>
  );
}

/** "Walk-in" / "Emergency" labels shown next to a visit's status. */
export function VisitBadges({ a }) {
  if (a?.visitType !== 'walk_in' && !a?.isEmergency) return null;
  return (
    <>
      {a.isEmergency && <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[12px] font-semibold text-white">Emergency</span>}
      {a.visitType === 'walk_in' && <span className="rounded-full bg-subtle px-2.5 py-0.5 text-[12px] font-semibold text-ink-2 ring-1 ring-inset ring-line">Walk-in</span>}
    </>
  );
}
