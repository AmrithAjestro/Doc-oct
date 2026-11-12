import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, Input } from '../../lib/ui';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { isEmail, passwordProblem, phoneProblem } from '../../lib/validation';

export default function Register() {
  const { registerUser } = useAuth();
  // A search started on the landing page survives sign-up.
  const from = useLocation().state?.from;
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const problems = {
    name: form.name.trim().length < 2 && 'Enter your full name',
    email: !isEmail(form.email) && 'Enter a valid email',
    phone: phoneProblem(form.phone),
    password: passwordProblem(form.password),
    confirm: form.confirm !== form.password && 'Passwords do not match'
  };
  const invalid = Object.values(problems).some(Boolean);
  const show = (k) => (touched ? problems[k] || null : null);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    setError('');
    setLoading(true);
    try {
      await registerUser({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      toast.success('Welcome! Your account is ready.');
      navigate(from || '/doctors', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Find a doctor and book a visit in under a minute.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" required error={show('name')}>
          <Input autoComplete="name" value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required error={show('email')}>
            <Input type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone" error={show('phone')}>
            <Input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" required error={show('password')} hint="8+ characters, a letter and a number">
            <Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Field label="Confirm password" required error={show('confirm')}>
            <Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        {error && <p className="text-[12px] font-semibold text-rose-500">{error}</p>}
        <Button type="submit" variant="primary" size="lg" icon={UserPlus} loading={loading} className="w-full">
          Create account
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
