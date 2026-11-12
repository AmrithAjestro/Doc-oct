import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, Input } from '../../lib/ui';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/api';

// Seeded by `npm run db:seed:demo` — handy for reviewers and the demo video.
const DEMO_ACCOUNTS = [
  { label: 'Patient', email: 'patient@demo.local', password: 'Demo@1234' },
  { label: 'Doctor', email: 'ananya.rao@demo.local', password: 'Demo@1234' },
  { label: 'Admin', email: 'admin@docbook.local', password: 'Admin@1234' }
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in as a patient, doctor or administrator.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" required>
          <Input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
        </Field>
        <Field label="Password" required>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="pr-10" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        {error && <p className="text-[12px] font-semibold text-rose-500">{error}</p>}
        <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={loading} disabled={!form.email || !form.password} className="w-full">
          Sign in
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-[13px] text-ink-2">
        <p>
          New patient?{' '}
          <Link to="/register" className="font-bold text-indigo-600 hover:underline dark:text-indigo-400">
            Create an account
          </Link>
        </p>
        <p>
          Are you a doctor?{' '}
          <Link to="/register/doctor" className="font-bold text-indigo-600 hover:underline dark:text-indigo-400">
            Join as a doctor
          </Link>
        </p>
      </div>

      <div className="surface mt-8 rounded-2xl p-4">
        <div className="label-eyebrow mb-2">Demo accounts</div>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <Button key={a.label} size="sm" onClick={() => setForm({ email: a.email, password: a.password })}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
