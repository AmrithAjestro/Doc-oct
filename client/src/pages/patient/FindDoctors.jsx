import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Stethoscope, CalendarClock, MapPin } from 'lucide-react';
import { PageHeader, SearchInput, Button, EmptyState, Badge } from '../../lib/ui';
import { Avatar, ErrorBanner, Pagination } from '../../components/common';
import { useAsync } from '../../lib/useAsync';
import { useBranding } from '../../context/BrandingContext';
import api, { unwrap } from '../../lib/api';
import { money, relative, dateTime } from '../../lib/format';

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
  const [search, setSearch] = useState('');
  const [specialization, setSpecialization] = useState('');
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
      className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
        specialization === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
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

      <ErrorBanner message={error} onRetry={reload} />

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="surface rounded-2xl">
          <EmptyState icon={Stethoscope} title="No doctors found" hint="Try another name or clear the specialization filter." />
        </div>
      ) : (
        <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
          {data.map((d) => (
            <Link key={d.id} to={`/doctors/${d.id}`} className="surface card-hover flex flex-col rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Avatar name={d.user.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-ink">Dr. {d.user.name}</div>
                  <div className="truncate text-xs text-ink-2">{d.qualification || d.specialization}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone="accent">{d.specialization}</Badge>
                    <Badge>{d.experienceYears} yrs exp.</Badge>
                  </div>
                </div>
              </div>
              {d.clinicAddress && (
                <div className="mt-3 flex items-center gap-1.5 truncate text-xs text-ink-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-3" /> {d.clinicAddress}
                </div>
              )}
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3 mt-4">
                <div>
                  <div className="label-eyebrow">Total fee</div>
                  <div className="tabular text-lg font-bold text-ink">{money(d.pricing.totalFee, currency)}</div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-ink-2" title={d.nextAvailableAt ? dateTime(d.nextAvailableAt) : undefined}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {d.nextAvailableAt ? `Next ${relative(d.nextAvailableAt)}` : 'No open slots'}
                  </div>
                  <Button size="sm" variant="primary" className="mt-1.5" disabled={!d.nextAvailableAt}>
                    View slots
                  </Button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </div>
  );
}
