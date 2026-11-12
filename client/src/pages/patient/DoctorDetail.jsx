import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarX2, MapPin, GraduationCap, Info, AlertTriangle } from 'lucide-react';
import { Panel, Button, Field, Textarea, Spinner, EmptyState, Badge, SectionHeader } from '../../lib/ui';
import { Avatar, ErrorBanner, FeeBreakdown, Notice } from '../../components/common';
import { useAsync } from '../../lib/useAsync';
import api, { errorCode, errorMessage, unwrap } from '../../lib/api';
import { toast } from '../../lib/toast';
import { dayKey, dayLabel, timeOnly, dateTime } from '../../lib/format';

const LOCK_HOURS = 24;

export default function DoctorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const doctor = useAsync(() => api.get(`/doctors/${id}`), [id]);
  const slots = useAsync(() => api.get(`/doctors/${id}/slots`, { params: { to: new Date(Date.now() + 30 * 86400e3).toISOString() } }), [id]);
  const [day, setDay] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [booking, setBooking] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map();
    (slots.data || []).forEach((s) => {
      const k = dayKey(s.startAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    });
    return map;
  }, [slots.data]);

  useEffect(() => {
    if (!day || !byDay.has(day)) setDay(byDay.keys().next().value || null);
  }, [byDay, day]);

  // Drop the selection if that slot disappeared on reload.
  useEffect(() => {
    if (selected && !(slots.data || []).some((s) => s.id === selected.id)) setSelected(null);
  }, [slots.data, selected]);

  if (doctor.loading && !doctor.data) return <Spinner />;
  if (doctor.error) return <ErrorBanner message={doctor.error} onRetry={doctor.reload} />;
  const d = doctor.data;
  const withinLock = selected && new Date(selected.startAt).getTime() - Date.now() < LOCK_HOURS * 3600e3;

  const book = async () => {
    setBooking(true);
    try {
      const appt = unwrap(await api.post('/appointments', { slotId: selected.id, reason: reason.trim() || null }));
      toast.success(appt.status === 'confirmed' ? 'Appointment confirmed' : 'Appointment booked — please confirm your attendance');
      navigate(`/appointments/${appt.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      if (['SLOT_UNAVAILABLE', 'SLOT_IN_PAST'].includes(errorCode(err))) {
        setSelected(null);
        slots.reload();
      }
    } finally {
      setBooking(false);
    }
  };

  return (
    <div>
      <Link to="/doctors" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-2 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All doctors
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Panel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar name={d.user.name} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold tracking-tight text-ink">Dr. {d.user.name}</h1>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone="accent">{d.specialization}</Badge>
                  <Badge>{d.experienceYears} years experience</Badge>
                </div>
                <div className="mt-3 space-y-1 text-[13px] text-ink-2">
                  {d.qualification && (
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-ink-3" /> {d.qualification}
                    </div>
                  )}
                  {d.clinicAddress && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-ink-3" /> {d.clinicAddress}
                    </div>
                  )}
                </div>
                {d.bio && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{d.bio}</p>}
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Choose a time" subtitle="Times are shown in your local time zone." className="mb-4" />
            {slots.loading && !slots.data ? (
              <Spinner label="Loading free slots…" />
            ) : slots.error ? (
              <ErrorBanner message={slots.error} onRetry={slots.reload} />
            ) : byDay.size === 0 ? (
              <EmptyState icon={CalendarX2} title="No free slots in the next 30 days" hint="Check back later — doctors add availability regularly." />
            ) : (
              <>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                  {[...byDay.entries()].map(([k, list]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDay(k)}
                      className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                        day === k ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-line bg-subtle text-ink hover:border-line-strong'
                      }`}
                    >
                      <div className="text-[12px] font-bold">{dayLabel(list[0].startAt)}</div>
                      <div className={`text-[10px] font-semibold ${day === k ? 'text-indigo-100' : 'text-ink-3'}`}>{list.length} free</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {(byDay.get(day) || []).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected(s)}
                      aria-pressed={selected?.id === s.id}
                      className={`tabular rounded-xl border px-2 py-2 text-[12px] font-bold transition-colors ${
                        selected?.id === s.id ? 'border-indigo-600 bg-accent-soft text-indigo-700 dark:text-indigo-300' : 'border-line bg-surface text-ink hover:border-indigo-400'
                      }`}
                    >
                      {timeOnly(s.startAt)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Panel className="space-y-4">
            <SectionHeader title="Your booking" />
            <div className="rounded-xl bg-subtle p-3">
              <div className="label-eyebrow">Time</div>
              <div className="mt-1 text-[14px] font-bold text-ink">{selected ? dateTime(selected.startAt) : 'Pick a slot'}</div>
            </div>
            <FeeBreakdown {...d.pricing} />
            <Field label="Reason for visit" hint="Optional — helps the doctor prepare.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
            </Field>
            {selected &&
              (withinLock ? (
                <Notice tone="warning" icon={AlertTriangle}>
                  This slot is within {LOCK_HOURS} hours. It is confirmed immediately and <b>cannot be cancelled or rescheduled</b>.
                </Notice>
              ) : (
                <Notice tone="info" icon={Info}>
                  Please confirm your attendance before <b>{dateTime(new Date(selected.startAt).getTime() - LOCK_HOURS * 3600e3)}</b>. Unconfirmed bookings are moved to the next free slot.
                </Notice>
              ))}
            <Button variant="primary" size="lg" className="w-full" disabled={!selected} loading={booking} onClick={book}>
              Book appointment
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
