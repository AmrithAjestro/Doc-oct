import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CalendarCheck2, BellRing } from 'lucide-react';
import Brand from '../../components/Brand';
import { useBranding } from '../../context/BrandingContext';

/** Single centred card: logo on top, the form inside, small print below. */
function CenteredCard({ title, subtitle, children }) {
  const { appName } = useBranding();
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[45vh] bg-gradient-to-b from-brand-100 to-transparent dark:from-brand-900/30" />
      <div className="relative w-full max-w-[420px]">
        <div className="rounded-2xl border border-line bg-surface px-7 py-9 shadow-xl shadow-brand-900/5 sm:px-9">
          <Link to="/" className="mb-6 flex justify-center">
            <Brand size="lg" />
          </Link>
          <div className="text-center">
            <h1 className="text-[24px] font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{subtitle}</p>}
          </div>
          <div className="mt-7">{children}</div>
        </div>
        <p className="mt-6 text-center text-[12px] text-ink-3">
          © {new Date().getFullYear()} {appName || 'DocBook'} · For patients, doctors and clinics
        </p>
      </div>
    </div>
  );
}

/** Split layout: brand story on the left (desktop), the form on the right. `centered` = single card. */
export default function AuthLayout({ title, subtitle, children, wide = false, centered = false }) {
  const { tagline } = useBranding();
  if (centered) return <CenteredCard title={title} subtitle={subtitle}>{children}</CenteredCard>;
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
