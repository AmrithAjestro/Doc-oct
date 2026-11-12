import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CalendarCheck2, BellRing } from 'lucide-react';
import Brand from '../../components/Brand';
import { useBranding } from '../../context/BrandingContext';

/** Split layout: brand story on the left (desktop), the form on the right. */
export default function AuthLayout({ title, subtitle, children, wide = false }) {
  const { tagline } = useBranding();
  const points = [
    { icon: ShieldCheck, text: 'Every doctor is verified by our team before they can take bookings.' },
    { icon: CalendarCheck2, text: 'Pick a real free slot — no double booking, ever.' },
    { icon: BellRing, text: 'Reminders a day, an hour and 15 minutes before your visit.' }
  ];
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
        <Link to="/" className="relative [&_*]:!text-white">
          <Brand size="lg" />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight">{tagline || 'Book trusted doctors in minutes'}</h2>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[14px] leading-relaxed text-indigo-100">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-indigo-200">Patients · Doctors · Administrators</p>
      </aside>

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-10 sm:items-center sm:px-8">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
          <Link to="/" className="mb-8 inline-block lg:hidden">
            <Brand />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
