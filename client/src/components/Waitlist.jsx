import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, BellOff, X } from 'lucide-react';
import { Button, Input } from '../lib/ui';
import api, { errorMessage, unwrap } from '../lib/api';
import { toast } from '../lib/toast';
import { dateOnly } from '../lib/format';

/** The patient's waitlist entries, shared by the doctor page and Find doctors. */
export function useWaitlist() {
  const [entries, setEntries] = useState(null);
  const reload = useCallback(() => api.get('/waitlist').then((r) => setEntries(unwrap(r)), () => setEntries([])), []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { entries, reload };
}

/**
 * "Notify me when a time opens" for one doctor, optionally for a single date. Patients on the
 * waitlist are told as soon as a slot frees up (cancellation, reopened slot or new availability).
 */
export function WaitlistControl({ doctorId, doctorName }) {
  const { entries, reload } = useWaitlist();
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const entry = entries?.find((e) => e.doctorId === doctorId);
  if (!entries) return null;

  const join = async () => {
    setBusy(true);
    try {
      await api.post(`/doctors/${doctorId}/waitlist`, { date: date || null });
      await reload();
      toast.success(date ? `We will tell you when ${doctorName} has a time on ${dateOnly(date)}` : `We will tell you when ${doctorName} has a new free time`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    try {
      await api.delete(`/doctors/${doctorId}/waitlist`);
      await reload();
      toast.success('Removed from the waitlist');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (entry) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3 text-[14px]">
        <span className="flex items-center gap-2 text-ink">
          <BellRing className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          You're on the waitlist{entry.preferredDate ? ` for ${dateOnly(entry.preferredDate)}` : ''}. We'll notify you when a time opens.
        </span>
        <Button size="sm" variant="ghost" icon={BellOff} loading={busy} onClick={leave}>
          Leave waitlist
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-4">
      <div className="text-[14px] font-medium text-ink">No time that suits you?</div>
      <p className="mt-0.5 text-[13.5px] text-ink-2">Join the waitlist and we'll message you as soon as a time opens, for example when someone cancels.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="!w-44" aria-label="Only this date (optional)" />
        <Button icon={BellRing} loading={busy} onClick={join}>
          {date ? 'Notify me for this date' : 'Notify me for any day'}
        </Button>
      </div>
    </div>
  );
}

/** Strip on Find doctors listing the doctors the patient is waiting for. */
export function WaitlistStrip() {
  const { entries, reload } = useWaitlist();
  if (!entries?.length) return null;
  const leave = async (doctorId) => {
    await api.delete(`/doctors/${doctorId}/waitlist`).catch(() => {});
    reload();
  };
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 text-[14px]">
      <span className="flex items-center gap-1.5 text-ink-2">
        <BellRing className="h-4 w-4" /> Your waitlist:
      </span>
      {entries.map((e) => (
        <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1">
          <Link to={`/doctors/${e.doctorId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Dr. {e.doctor?.user?.name}
          </Link>
          {e.preferredDate && <span className="text-ink-3">, {dateOnly(e.preferredDate)}</span>}
          <button type="button" onClick={() => leave(e.doctorId)} className="rounded-full p-1 text-ink-3 hover:bg-subtle hover:text-ink" aria-label={`Leave Dr. ${e.doctor?.user?.name}'s waitlist`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
