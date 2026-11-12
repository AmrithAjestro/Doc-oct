import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Stethoscope, CalendarClock, MapPin, GraduationCap, ShieldCheck } from 'lucide-react';
import { PageHeader, SearchInput, Button, EmptyState } from '../../lib/ui';
import { Avatar, ErrorBanner, Pagination, RatingLine } from '../../components/common';
import { useAsync } from '../../lib/useAsync';
import { WaitlistStrip } from '../../components/Waitlist';
import { useBranding } from '../../context/BrandingContext';
import api, { unwrap } from '../../lib/api';
import { money, dayLabel, timeOnly } from '../../lib/format';

/** Debounced copy of a value, so typing in the search box does not fire a request per key. */
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function FindDoctors() {
  const { currency } = useBranding();
  // A search started on the landing page arrives as ?search= or ?specialization=.
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [specialization, setSpecialization] = useState(params.get('specialization') || '');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const [specs, setSpecs] = useState([]);

  useEffect(() => {
    api.get('/doctors/specializations').then((r) => setSpecs(unwrap(r)), () => {});
  }, []);
  useEffect(() => setPage(1), [q, specialization]);

  const { data, meta, loading, error, reload } = useAsync(
    () => api.get('/doctors', { params: { search: q || undefined, specialization: specialization || undefined, page, limit: 12 } }),
    [q, specialization, page]
  );

  const chip = (value, label, count) => (
    <button
      key={value || 'all'}
      type="button"
      onClick={() => setSpecialization(value)}
      className={`rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
        specialization === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
      }`}
    >
      {label}
      {count != null && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  );

  return (
    <div>
      <PageHeader title="Find a doctor" subtitle="Fees shown include the platform fee. Pick a doctor to see their free slots." />

      <div className="mb-5 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, specialization or qualification…" className="max-w-xl" />
        <div className="flex flex-wrap gap-2">
          {chip('', 'All')}
          {specs.map((s) => chip(s.name, s.name, s.count))}
        </div>
      </div>

      <WaitlistStrip />
      <ErrorBanner message={error} onRetry={reload} />

      {!loading && data && (
        <p className="mb-3 text-[14px] text-ink-2">
          {meta?.total ?? data.length} {(meta?.total ?? data.length) === 1 ? 'doctor' : 'doctors'} available{specialization ? ` in ${specialization}` : ''}
        </p>
      )}
      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-[20px]" />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="surface rounded-[20px]">
          <EmptyState icon={Stethoscope} title="No doctors found" hint="Try another name or clear the specialty filter." />
        </div>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {data.map((d) => (
            <li key={d.id} className="surface flex flex-col gap-5 rounded-[20px] p-5 sm:p-6 md:flex-row md:items-center">
              <Link to={`/doctors/${d.id}`} className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
                <Avatar name={d.user.name} photoUrl={d.photoUrl} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-[19px] font-semibold leading-snug text-brand-700 hover:underline dark:text-brand-300">Dr. {d.user.name}</h2>
                  <div className="mt-0.5 text-[15px] text-ink">{d.specialization}</div>
                  <div className="mt-0.5 text-[14px] text-ink-2">{d.experienceYears} years of experience</div>
                  <div className="mt-1.5"><RatingLine avg={d.ratingAvg} count={d.ratingCount} /></div>
                  {d.runningLate && new Date(d.runningLate.until) > new Date() && (
                    <div className="mt-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-400">
                      Running about {d.runningLate.minutes} min late until {timeOnly(d.runningLate.until)}
                    </div>
                  )}
                  <div className="mt-3 space-y-1 text-[14px] text-ink-2">
                    {d.qualification && (
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 shrink-0 text-ink-3" /> {d.qualification}
                      </div>
                    )}
                    {d.clinicAddress && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-ink-3" /> <span className="truncate">{d.clinicAddress}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 dark:text-brand-300">
                    <ShieldCheck className="h-4 w-4" /> Certificate verified
                  </div>
                </div>
              </Link>

              <div className="flex shrink-0 flex-col gap-3 border-t border-line pt-4 md:w-64 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <div className="flex items-baseline justify-between md:block">
                  <div className="tabular text-[20px] font-semibold text-ink">{money(d.pricing.totalFee, currency)}</div>
                  <div className="text-[13px] text-ink-3">consultation, incl. platform fee</div>
                </div>
                <div className={`flex items-center gap-2 text-[14px] ${d.nextAvailableAt ? 'text-ink' : 'text-ink-3'}`}>
                  <CalendarClock className={`h-4 w-4 shrink-0 ${d.nextAvailableAt ? 'text-brand-600 dark:text-brand-400' : ''}`} />
                  {d.nextAvailableAt ? (
                    <span>
                      Next free <b className="font-semibold">{dayLabel(d.nextAvailableAt)}, {timeOnly(d.nextAvailableAt)}</b>
                    </span>
                  ) : (
                    'No free times right now'
                  )}
                </div>
                {d.nextAvailableAt ? (
                  <Link to={`/doctors/${d.id}`}>
                    <Button variant="primary" className="w-full">Book clinic visit</Button>
                  </Link>
                ) : (
                  <Link to={`/doctors/${d.id}`}>
                    <Button className="w-full">View profile</Button>
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}
