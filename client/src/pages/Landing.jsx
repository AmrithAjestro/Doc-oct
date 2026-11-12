import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CalendarCheck2, ShieldCheck, BellRing, Clock, Search } from 'lucide-react';
import Brand from '../components/Brand';
import { Button } from '../lib/ui';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useAsync } from '../lib/useAsync';
import api from '../lib/api';
import { money, dayLabel, timeOnly } from '../lib/format';

export default function Landing() {
  const { user } = useAuth();
  const { tagline, currency } = useBranding();
  const doctors = useAsync(() => api.get('/doctors', { params: { limit: 6 } }), []);
  const specs = useAsync(() => api.get('/doctors/specializations'), []);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  // Browsing needs an account, so the search is carried through sign-in to Find doctors.
  const goFind = (params) => navigate('/login', { state: { from: `/doctors?${new URLSearchParams(params)}` } });
  if (user) return <Navigate to="/dashboard" replace />;
  const NEEDS = {
    Cardiology: 'Chest pain, breathlessness or high blood pressure',
    Dermatology: 'Acne, rashes, hair fall or skin allergies',
    Pediatrics: 'Fever, vaccinations and growth checks for children',
    Orthopedics: 'Joint pain, back pain, sprains and fractures',
    'General Medicine': 'Cold, cough, fever and everyday health concerns',
    Gynecology: 'Periods, pregnancy and women’s health',
    Dentistry: 'Tooth pain, cleaning, fillings and braces',
    Psychiatry: 'Stress, anxiety, sleep and low mood',
    ENT: 'Ear, nose and throat problems',
    Ophthalmology: 'Eye checks, blurred vision and irritation'
  };

  const features = [
    { icon: ShieldCheck, title: 'Verified doctors', text: 'Certificates are checked by our team before a doctor can accept bookings.' },
    { icon: CalendarCheck2, title: 'Real availability', text: 'Choose from the doctor’s actual free slots. One slot, one patient.' },
    { icon: BellRing, title: 'Smart reminders', text: 'A day, an hour and 15 minutes before — so you never miss a visit.' },
    { icon: Clock, title: 'Flexible changes', text: 'Can’t make it? Move to the next free slot in one tap (up to 24 h before).' }
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/register" className="hidden sm:block">
            <Button variant="primary">Get started</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-start gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div className="max-w-xl">
          <h1 className="text-[40px] font-bold leading-[1.08] tracking-tight text-brand-900 dark:text-ink sm:text-[54px]">
            {tagline || 'Book trusted doctors in minutes'}
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-2">
            Pick a real free time from a verified doctor. You see the full fee before you book, and your prescription arrives in the same place.
          </p>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              goFind(query.trim() ? { search: query.trim() } : {});
            }}
            className="mt-9 flex max-w-lg items-center gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-100 dark:focus-within:ring-brand-950"
          >
            <Search className="ml-3 h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
            <label htmlFor="hero-search" className="sr-only">Search doctors or specialties</label>
            <input
              id="hero-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Doctor name or specialty, e.g. skin"
              className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
            <Button type="submit" variant="primary">Find a doctor</Button>
          </form>
          <p className="mt-4 text-[14px] text-ink-2">
            Are you a doctor?{' '}
            <Link to="/register/doctor" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Join and publish your free times</Link>
          </p>
        </div>

        {/* The memorable element: tomorrow's real openings, read like a clinic's front-desk board. */}
        <div className="rounded-[28px] border border-line bg-surface p-2">
          <div className="flex items-baseline justify-between px-4 pb-3 pt-4">
            <h2 className="text-[17px] font-semibold">Next free appointments</h2>
            <span className="text-[13px] text-ink-3">Live from the schedule</span>
          </div>
          <ul className="divide-y divide-line rounded-[22px] bg-canvas">
            {(doctors.data || []).map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-4 py-3.5">
                <div className="w-[92px] shrink-0 whitespace-nowrap">
                  {d.nextAvailableAt ? (
                    <>
                      <div className="tabular text-[19px] font-semibold leading-none text-brand-700 dark:text-brand-300">{timeOnly(d.nextAvailableAt)}</div>
                      <div className="mt-1 text-[12px] text-ink-3">{dayLabel(d.nextAvailableAt)}</div>
                    </>
                  ) : (
                    <div className="text-[13px] text-ink-3">Fully booked</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">Dr. {d.user.name}</div>
                  <div className="truncate text-[13px] text-ink-2">{d.specialization}, {d.experienceYears} years</div>
                </div>
                <div className="tabular shrink-0 text-[14px] font-medium text-ink-2">{money(d.pricing.totalFee, currency)}</div>
              </li>
            ))}
            {doctors.loading && [0, 1, 2, 3].map((i) => <li key={i} className="mx-4 my-3 h-10 skeleton" />)}
            {!doctors.loading && !doctors.data?.length && (
              <li className="px-4 py-8 text-center text-[14px] text-ink-2">No doctors have opened their calendars yet.</li>
            )}
          </ul>
          <Link to="/register" className="block px-4 py-3.5 text-[14px] font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Create an account to book one of these times
          </Link>
        </div>
      </section>

      {specs.data?.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="text-[24px] font-bold tracking-tight text-brand-900 dark:text-ink">Book by what you need</h2>
          <p className="mt-1.5 text-[15px] text-ink-2">Choose a specialty to see doctors with free times.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {specs.data.map((sp) => (
              <button
                key={sp.name}
                type="button"
                onClick={() => goFind({ specialization: sp.name })}
                className="group flex items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-brand-300 dark:hover:border-brand-800"
              >
                <span>
                  <span className="block text-[16px] font-semibold text-ink group-hover:text-brand-700 dark:group-hover:text-brand-300">{sp.name}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-ink-2">{NEEDS[sp.name] || `See a ${sp.name.toLowerCase()} specialist`}</span>
                </span>
                <span className="tabular shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-[12px] font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  {sp.count} {sp.count === 1 ? 'doctor' : 'doctors'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-8 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <div className="mt-3 text-[15px] font-semibold">{title}</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
