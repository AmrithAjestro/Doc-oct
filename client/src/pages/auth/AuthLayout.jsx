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
      <aside className="hidden w-[40%] flex-col justify-between border-r border-line bg-brand-50 p-12 dark:bg-subtle lg:flex">
        <Link to="/">
          <Brand size="lg" />
        </Link>
        <div className="max-w-md">
          <h2 className="text-[34px] font-bold leading-[1.15] tracking-tight text-brand-900 dark:text-ink">{tagline || 'Book trusted doctors in minutes'}</h2>
          <ul className="mt-10 space-y-5">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3.5 text-[15px] leading-relaxed text-brand-900/80 dark:text-ink-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand-700 ring-1 ring-brand-200 dark:text-brand-300 dark:ring-line">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-brand-800/70 dark:text-ink-3">For patients, doctors and clinic administrators.</p>
      </aside>

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-10 sm:items-center sm:px-8">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
          <Link to="/" className="mb-8 inline-block lg:hidden">
            <Brand />
          </Link>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
