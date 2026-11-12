import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarX2, MapPin, GraduationCap, Info, AlertTriangle, Languages, Clock3, ShieldCheck, Sunrise, Sun, Moon } from 'lucide-react';
import { Panel, Button, Field, Textarea, Spinner, EmptyState, Badge, SectionHeader } from '../../lib/ui';
import { Avatar, ErrorBanner, FeeBreakdown, Notice, RatingLine, Stars, Pagination } from '../../components/common';
import { useAsync } from '../../lib/useAsync';
import { WaitlistControl } from '../../components/Waitlist';
import api, { errorCode, errorMessage, unwrap } from '../../lib/api';
import { toast } from '../../lib/toast';
import { dayKey, dayLabel, timeOnly, dateTime } from '../../lib/format';

const LOCK_HOURS = 24;

// Slots grouped by the part of the day, in the patient's local time.
const PARTS = [
  { key: 'morning', label: 'Morning', icon: Sunrise, test: (h) => h < 12 },
  { key: 'afternoon', label: 'Afternoon', icon: Sun, test: (h) => h >= 12 && h < 17 },
  { key: 'evening', label: 'Evening', icon: Moon, test: (h) => h >= 17 }
];

function Reviews({ doctorId }) {
  const [page, setPage] = useState(1);
  const { data, meta, loading } = useAsync(() => api.get(`/doctors/${doctorId}/reviews`, { params: { page } }), [doctorId, page]);
  if (loading && !data) return null;
  return (
    <Panel>
      <SectionHeader title="Patient reviews" subtitle="From patients who completed a visit." className="mb-4" />
      {!data?.length ? (
        <p className="text-[14px] text-ink-2">No reviews yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.map((r) => (
            <li key={r.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold text-ink">{r.author}</span>
                <span className="text-[13px] text-ink-3">{dayLabel(r.createdAt)}</span>
              </div>
              <div className="mt-1"><Stars value={r.rating} /></div>
              {r.comment && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </Panel>
  );
}

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
  // The doctor is behind schedule (an emergency); times before runningLate.until may start late.
  const late = d.runningLate && new Date(d.runningLate.until) > new Date() ? d.runningLate : null;
  const selectedLate = late && selected && new Date(selected.startAt) < new Date(late.until);

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
      <Link to="/doctors" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All doctors
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar name={d.user.name} photoUrl={d.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-[24px] font-bold tracking-tight text-ink">Dr. {d.user.name}</h1>
                <div className="mt-0.5 text-[15px] text-ink">{d.specialization}, {d.experienceYears} years of experience</div>
                <div className="mt-2"><RatingLine avg={d.ratingAvg} count={d.ratingCount} /></div>
                <div className="mt-4 space-y-1.5 text-[14px] text-ink-2">
                  {d.qualification && (
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-ink-3" /> {d.qualification}
                    </div>
                  )}
                  {d.clinicAddress && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-ink-3" /> {d.clinicAddress}
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.clinicAddress)}`} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                        Map
                      </a>
                    </div>
                  )}
                  {d.clinicHours && (
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-ink-3" /> {d.clinicHours}
                    </div>
                  )}
                  {d.languages && (
                    <div className="flex items-center gap-2">
                      <Languages className="h-4 w-4 text-ink-3" /> Speaks {d.languages}
                    </div>
                  )}
                  <div className="flex items-center gap-2 font-medium text-brand-700 dark:text-brand-300">
                    <ShieldCheck className="h-4 w-4" /> Registration certificate verified
                  </div>
                </div>
                {d.bio && <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{d.bio}</p>}
                {late && (
                  <Notice tone="warning" icon={AlertTriangle} className="mt-4" title={`Running about ${late.minutes} minutes late`}>
                    Dr. {d.user.name} is attending an emergency. Visits before {timeOnly(late.until)} may start late; later times are not affected.
                  </Notice>
                )}
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
                      className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                        day === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-ink hover:border-line-strong'
                      }`}
                    >
                      <div className="whitespace-nowrap text-[14px] font-semibold">{dayLabel(list[0].startAt)}</div>
                      <div className={`text-[12.5px] ${day === k ? 'text-brand-100' : 'text-ink-3'}`}>{list.length} free</div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-5">
                  {PARTS.map((part) => {
                    const list = (byDay.get(day) || []).filter((sl) => part.test(new Date(sl.startAt).getHours()));
                    if (!list.length) return null;
                    return (
                      <div key={part.key}>
                        <div className="mb-2 flex items-center gap-2 text-[14px] font-medium text-ink-2">
                          <part.icon className="h-4 w-4" /> {part.label}
                          <span className="text-ink-3">({list.length} {list.length === 1 ? 'slot' : 'slots'})</span>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                          {list.map((sl) => (
                            <button
                              key={sl.id}
                              type="button"
                              onClick={() => setSelected(sl)}
                              aria-pressed={selected?.id === sl.id}
                              className={`tabular whitespace-nowrap rounded-xl border px-2 py-2.5 text-[14px] font-medium transition-colors ${
                                selected?.id === sl.id ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500' : 'border-line bg-surface text-ink hover:border-brand-400'
                              }`}
                            >
                              {timeOnly(sl.startAt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="mt-6">
              <WaitlistControl doctorId={d.id} doctorName={`Dr. ${d.user.name}`} />
            </div>
          </Panel>

          <Reviews doctorId={d.id} />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Panel className="space-y-4">
            <SectionHeader title="Your booking" />
            <dl className="space-y-2 rounded-xl bg-subtle p-4 text-[14px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Doctor</dt>
                <dd className="truncate text-right font-medium text-ink">Dr. {d.user.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">When</dt>
                <dd className="text-right font-medium text-ink">{selected ? dateTime(selected.startAt) : 'Choose a time'}</dd>
              </div>
              {d.clinicAddress && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-2">Where</dt>
                  <dd className="text-right font-medium text-ink">{d.clinicAddress}</dd>
                </div>
              )}
            </dl>
            <FeeBreakdown {...d.pricing} />
            <Field label="Reason for visit" hint="Optional — helps the doctor prepare.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
            </Field>
            {selectedLate && (
              <Notice tone="warning" icon={AlertTriangle}>
                The doctor is running about {late.minutes} minutes late, so this time may start late. A time after {timeOnly(late.until)} is not affected.
              </Notice>
            )}
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
