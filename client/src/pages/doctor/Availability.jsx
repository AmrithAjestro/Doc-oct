import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, X, RotateCcw, CalendarX2 } from 'lucide-react';
import { PageHeader, Panel, SectionHeader, Field, Input, Select, Button, Spinner, EmptyState, askConfirm } from '../../lib/ui';
import { ErrorBanner, Notice } from '../../components/common';
import { useAsync } from '../../lib/useAsync';
import api, { errorMessage, unwrap } from '../../lib/api';
import { toast } from '../../lib/toast';
import { dayKey, dayLabel, timeOnly, dateTime } from '../../lib/format';

const WEEKDAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun']
];
const DAY_MS = 86400e3;
const todayKey = () => dayKey(new Date());
const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/** Turns the form into concrete slots in the doctor's local time zone (sent to the API as UTC instants). */
function buildSlots({ from, to, weekdays, start, end, duration, gap }) {
  const out = [];
  if (!from || !to || from > to || !start || !end || start >= end) return out;
  const now = Date.now();
  for (let key = from; key <= to && out.length <= 400; key = addDays(key, 1)) {
    const day = new Date(`${key}T00:00:00`);
    if (!weekdays.includes(day.getDay())) continue;
    let cursor = new Date(`${key}T${start}:00`);
    const stop = new Date(`${key}T${end}:00`);
    while (cursor.getTime() + duration * 60e3 <= stop.getTime()) {
      const slotEnd = new Date(cursor.getTime() + duration * 60e3);
      if (cursor.getTime() > now) out.push({ startAt: cursor.toISOString(), endAt: slotEnd.toISOString() });
      cursor = new Date(slotEnd.getTime() + gap * 60e3);
    }
  }
  return out;
}

function Generator({ onCreated }) {
  const [form, setForm] = useState({ from: todayKey(), to: addDays(todayKey(), 6), weekdays: [1, 2, 3, 4, 5, 6], start: '09:00', end: '13:00', duration: 30, gap: 0 });
  const [saving, setSaving] = useState(false);
  const slots = useMemo(() => buildSlots(form), [form]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleDay = (d) => setForm((f) => ({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] }));
  const tooMany = slots.length > 300;
  const rangeTooLong = form.from && form.to && (new Date(form.to) - new Date(form.from)) / DAY_MS > 89;

  const submit = async () => {
    setSaving(true);
    try {
      const { created, skipped } = unwrap(await api.post('/doctor/slots', { slots }));
      if (created.length) toast.success(`${created.length} slot${created.length > 1 ? 's' : ''} added${skipped.length ? ` · ${skipped.length} skipped (overlap or past)` : ''}`);
      else toast.error(`No new slots — all ${skipped.length} overlap existing slots or are in the past`);
      onCreated(form.from);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <SectionHeader title="Add availability" subtitle="Slots that overlap ones you already have are skipped automatically." />
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[1fr_auto]">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From">
          <Input type="date" value={form.from} min={todayKey()} onChange={set('from')} />
        </Field>
        <Field label="To">
          <Input type="date" value={form.to} min={form.from} max={addDays(todayKey(), 89)} onChange={set('to')} />
        </Field>
      </div>
      <div>
        <div className="label-eyebrow mb-1.5">Days</div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              aria-pressed={form.weekdays.includes(d)}
              className={`w-[52px] rounded-xl border py-2.5 text-[13.5px] font-semibold transition-colors ${
                form.weekdays.includes(d) ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Start time">
          <Input type="time" value={form.start} onChange={set('start')} />
        </Field>
        <Field label="End time">
          <Input type="time" value={form.end} onChange={set('end')} />
        </Field>
        <Field label="Slot length">
          <Select value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}>
            {[10, 15, 20, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Break between">
          <Select value={form.gap} onChange={(e) => setForm({ ...form, gap: Number(e.target.value) })}>
            {[0, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m ? `${m} min` : 'None'}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {form.start >= form.end && <p className="text-[11px] font-semibold text-rose-500">End time must be after the start time.</p>}
      {rangeTooLong && <p className="text-[11px] font-semibold text-rose-500">You can plan up to 90 days ahead.</p>}
      <div className="flex flex-col gap-3 rounded-xl bg-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[13px] text-ink-2">
          {slots.length ? (
            <>
              <b className="text-ink">{Math.min(slots.length, 400)}{slots.length > 400 ? '+' : ''}</b> slots · first {dateTime(slots[0].startAt)}
            </>
          ) : (
            'No slots match these settings (times in the past are left out).'
          )}
          {tooMany && <div className="text-[11px] font-semibold text-rose-500">At most 300 slots at a time — shorten the date range.</div>}
        </div>
        <Button variant="primary" icon={CalendarPlus} loading={saving} disabled={!slots.length || tooMany || rangeTooLong} onClick={submit}>
          Add slots
        </Button>
      </div>
    </Panel>
  );
}

function SlotChip({ slot, onDelete, onUnblock, onOpen }) {
  const appt = slot.appointments?.[0];
  const past = new Date(slot.startAt) <= new Date();
  if (slot.status === 'booked') {
    return (
      <button type="button" onClick={() => appt && onOpen(appt.id)} className="flex min-w-0 flex-col rounded-xl border border-brand-600 bg-brand-600 px-3 py-2 text-left text-white hover:bg-brand-700 dark:border-brand-500 dark:bg-brand-500" title="Open appointment">
        <span className="tabular whitespace-nowrap text-[14px] font-semibold">{timeOnly(slot.startAt)}</span>
        <span className="truncate text-[12px] opacity-90">{appt?.patient?.name || 'Booked'}</span>
      </button>
    );
  }
  const blocked = slot.status === 'blocked';
  return (
    <div className={`group flex items-center justify-between gap-1 rounded-xl border px-3 py-2 ${blocked ? 'border-dashed border-line-strong bg-subtle' : 'border-line bg-surface'} ${past ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <div className={`tabular whitespace-nowrap text-[14px] font-semibold ${blocked ? 'text-ink-3 line-through' : 'text-ink'}`}>{timeOnly(slot.startAt)}</div>
        <div className="text-[12px] text-ink-3">{blocked ? 'Blocked' : past ? 'Passed' : 'Free'}</div>
      </div>
      <div className="flex shrink-0">
        {blocked && !past && (
          <button type="button" onClick={() => onUnblock(slot)} className="rounded-md p-1 text-ink-3 hover:bg-subtle hover:text-brand-600" aria-label="Reopen slot" title="Reopen">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" onClick={() => onDelete(slot)} className="rounded-md p-1 text-ink-3 hover:bg-subtle hover:text-rose-600" aria-label="Delete slot" title="Delete">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function Availability() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(todayKey());
  const range = { from: new Date(`${weekStart}T00:00:00`).toISOString(), to: new Date(`${addDays(weekStart, 7)}T00:00:00`).toISOString() };
  const { data, loading, error, reload, setData } = useAsync(() => api.get('/doctor/slots', { params: range }), [weekStart]);

  const days = useMemo(() => {
    const map = new Map(Array.from({ length: 7 }, (_, i) => [addDays(weekStart, i), []]));
    (data || []).forEach((s) => map.get(dayKey(s.startAt))?.push(s));
    return [...map.entries()];
  }, [data, weekStart]);

  const remove = async (slot) => {
    if (!(await askConfirm(`Remove the ${timeOnly(slot.startAt)} slot on ${dayLabel(slot.startAt)}?`, { title: 'Delete slot?', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await api.delete(`/doctor/slots/${slot.id}`);
      setData((rows) => rows.filter((r) => r.id !== slot.id));
      toast.success('Slot deleted');
    } catch (err) {
      toast.error(errorMessage(err));
      reload();
    }
  };

  const unblock = async (slot) => {
    try {
      const updated = unwrap(await api.post(`/doctor/slots/${slot.id}/unblock`));
      setData((rows) => rows.map((r) => (r.id === slot.id ? { ...r, status: updated.status } : r)));
      toast.success('Slot reopened for booking');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const counts = (data || []).reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {});

  return (
    <div>
      <PageHeader title="Availability" subtitle="Publish the times patients can book. Booked slots cannot be deleted — cancel the appointment first." />
      <div className="space-y-5">
        <div>
          <Generator
            onCreated={(from) => {
              if (from === weekStart) reload();
              else setWeekStart(from);
            }}
          />
        </div>

        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title={`${dayLabel(`${weekStart}T00:00:00`)} – ${dayLabel(`${addDays(weekStart, 6)}T00:00:00`)}`} subtitle={`${counts.available || 0} free · ${counts.booked || 0} booked · ${counts.blocked || 0} blocked`} />
            <div className="flex gap-1.5">
              <Button size="sm" icon={ChevronLeft} disabled={weekStart <= todayKey()} onClick={() => setWeekStart(addDays(weekStart, -7) < todayKey() ? todayKey() : addDays(weekStart, -7))}>
                Prev
              </Button>
              <Button size="sm" onClick={() => setWeekStart(todayKey())} disabled={weekStart === todayKey()}>
                Today
              </Button>
              <Button size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <ErrorBanner message={error} onRetry={reload} />
          {loading && !data ? (
            <Spinner />
          ) : !data?.length ? (
            <EmptyState icon={CalendarX2} title="No slots this week" hint="Use “Add availability” to publish times patients can book." />
          ) : (
            <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
              {days.map(([key, slots]) => (
                <div key={key} className="grid gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0 sm:grid-cols-[130px_1fr]">
                  <div className="pt-2 text-[14px] font-semibold text-ink">
                    {dayLabel(`${key}T00:00:00`)}
                    {key === todayKey() && <span className="mt-0.5 block text-[12px] font-medium text-brand-700 dark:text-brand-300">Today</span>}
                  </div>
                  {slots.length ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2">
                      {slots.map((s) => (
                        <SlotChip key={s.id} slot={s} onDelete={remove} onUnblock={unblock} onOpen={(id) => navigate(`/appointments/${id}`)} />
                      ))}
                    </div>
                  ) : (
                    <div className="pt-2 text-[14px] text-ink-3">No slots</div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Notice tone="info" className="mt-5">
            Slots blocked after you cancel an appointment stay closed until you reopen them.
          </Notice>
        </Panel>
      </div>
    </div>
  );
}
