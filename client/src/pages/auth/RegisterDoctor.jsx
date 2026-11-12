import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, Input, Textarea, SectionHeader } from '../../lib/ui';
import FilePicker from '../../components/FilePicker';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { CERTIFICATE_TYPES, fileProblem, isEmail, passwordProblem, phoneProblem } from '../../lib/validation';

const EMPTY = { name: '', email: '', phone: '', password: '', specialization: '', qualification: '', experienceYears: '', fee: '', clinicAddress: '', bio: '' };

export default function RegisterDoctor() {
  const { registerDoctor } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [certificate, setCertificate] = useState(null);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const problems = {
    name: form.name.trim().length < 2 && 'Enter your full name',
    email: !isEmail(form.email) && 'Enter a valid email',
    phone: phoneProblem(form.phone),
    password: passwordProblem(form.password),
    specialization: form.specialization.trim().length < 2 && 'Required',
    experienceYears: form.experienceYears !== '' && !(Number(form.experienceYears) >= 0 && Number(form.experienceYears) <= 70) && '0–70 years',
    fee: !(form.fee !== '' && Number(form.fee) >= 0) && 'Enter your consultation fee',
    certificate: fileProblem(certificate, CERTIFICATE_TYPES, 5)
  };
  const show = (k) => (touched ? problems[k] || null : null);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(problems).some(Boolean)) return;
    setError('');
    setLoading(true);
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => v !== '' && data.append(k, v));
    data.append('certificate', certificate);
    try {
      await registerDoctor(data);
      toast.success('Registration received. We will review your certificate shortly.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout wide title="Join as a doctor" subtitle="Your profile goes live once an administrator has verified your registration certificate.">
      <form onSubmit={submit} className="space-y-6" noValidate>
        <section className="space-y-4">
          <SectionHeader title="Account" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={show('name')} hint="Without the “Dr.” prefix">
              <Input value={form.name} onChange={set('name')} autoComplete="name" autoFocus />
            </Field>
            <Field label="Email" required error={show('email')}>
              <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>
            <Field label="Phone" error={show('phone')}>
              <Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
            </Field>
            <Field label="Password" required error={show('password')} hint="8+ characters, a letter and a number">
              <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeader title="Practice" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Specialization" required error={show('specialization')}>
              <Input value={form.specialization} onChange={set('specialization')} placeholder="e.g. Cardiology" list="specializations" />
              <datalist id="specializations">
                {['General Medicine', 'Cardiology', 'Dermatology', 'Pediatrics', 'Orthopedics', 'Gynecology', 'Neurology', 'Psychiatry', 'ENT', 'Ophthalmology', 'Dentistry'].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Qualification">
              <Input value={form.qualification} onChange={set('qualification')} placeholder="e.g. MBBS, MD" />
            </Field>
            <Field label="Experience (years)" error={show('experienceYears')}>
              <Input type="number" min="0" max="70" value={form.experienceYears} onChange={set('experienceYears')} />
            </Field>
            <Field label="Consultation fee" required error={show('fee')} hint="A platform fee is added on top for patients">
              <Input type="number" min="0" step="1" value={form.fee} onChange={set('fee')} />
            </Field>
          </div>
          <Field label="Clinic address">
            <Input value={form.clinicAddress} onChange={set('clinicAddress')} />
          </Field>
          <Field label="About you">
            <Textarea value={form.bio} onChange={set('bio')} rows={3} maxLength={2000} placeholder="Areas of focus, languages spoken…" />
          </Field>
        </section>

        <section className="space-y-3">
          <SectionHeader title="Registration certificate" subtitle="PDF, JPG or PNG up to 5 MB. Only administrators can see it." />
          <FilePicker file={certificate} onChange={setCertificate} accept=".pdf,.jpg,.jpeg,.png" hint="PDF, JPG or PNG · max 5 MB" error={show('certificate')} />
        </section>

        {error && <p className="text-[12px] font-semibold text-rose-500">{error}</p>}
        <Button type="submit" variant="primary" size="lg" icon={Stethoscope} loading={loading} className="w-full">
          Submit for review
        </Button>
      </form>
      <p className="mt-6 text-center text-[13px] text-ink-2">
        Already registered?{' '}
        <Link to="/login" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
