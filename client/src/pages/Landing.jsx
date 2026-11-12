import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, ShieldCheck, BellRing, Clock } from 'lucide-react';
import Brand from '../components/Brand';
import { Button, Badge } from '../lib/ui';
import { Avatar } from '../components/common';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useAsync } from '../lib/useAsync';
import api from '../lib/api';
import { money, relative } from '../lib/format';

export default function Landing() {
  const { user } = useAuth();
  const { tagline, currency } = useBranding();
  const doctors = useAsync(() => api.get('/doctors', { params: { limit: 6 } }), []);
  if (user) return <Navigate to="/dashboard" replace />;

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

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="max-w-3xl">
          <Badge tone="accent">Online doctor appointments</Badge>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">{tagline || 'Book trusted doctors in minutes'}</h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2">
            See transparent fees, pick a time that suits you and get your prescription in the same place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register">
              <Button variant="primary" size="lg">
                Book an appointment <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/register/doctor">
              <Button size="lg">I am a doctor</Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="surface rounded-2xl p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-indigo-600 dark:text-indigo-300">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-bold">{title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{text}</p>
            </div>
          ))}
        </div>

        {doctors.data?.length > 0 && (
          <div className="mt-16">
            <h2 className="text-lg font-bold tracking-tight">Our doctors</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {doctors.data.map((d) => (
                <div key={d.id} className="surface flex items-center gap-3 rounded-2xl p-4">
                  <Avatar name={d.user.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">Dr. {d.user.name}</div>
                    <div className="truncate text-xs text-ink-2">
                      {d.specialization} · {d.experienceYears} yrs
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-ink-3">
                      {money(d.pricing.totalFee, currency)} · {d.nextAvailableAt ? `next slot ${relative(d.nextAvailableAt)}` : 'no open slots'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
