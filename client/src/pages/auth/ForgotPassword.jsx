import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { Button, Field, Input } from '../../lib/ui';
import { Notice } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import api, { errorMessage, unwrap } from '../../lib/api';
import { toast } from '../../lib/toast';
import { isEmail, passwordProblem } from '../../lib/validation';

/** Step 1: ask for a reset link by e-mail. */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isEmail(email)) return setError('Enter the e-mail address you signed up with.');
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We will e-mail you a link to choose a new password.">
      {sent ? (
        <Notice tone="success" icon={MailCheck} title="Check your inbox">
          If an account exists for <b>{email}</b>, a reset link is on its way. It works once and expires in 30 minutes.
        </Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="E-mail" required error={error}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-[14px] text-ink-2">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

/** Step 2: the link from the e-mail opens this page with ?token=. */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const problem = form.password && (passwordProblem(form.password) || (form.confirm && form.confirm !== form.password && 'Passwords do not match'));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.password || problem || form.confirm !== form.password) return setError(problem || 'Enter the new password twice.');
    setError('');
    setLoading(true);
    try {
      startSession(unwrap(await api.post('/auth/reset-password', { token, password: form.password })));
      toast.success('Password changed. You are signed in.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <AuthLayout title="Reset link not valid" subtitle="The link is incomplete. Open it again from the e-mail, or ask for a new one.">
        <Link to="/forgot-password">
          <Button variant="primary" size="lg" className="w-full">Ask for a new link</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="At least 8 characters, with a letter and a number. Other devices will be signed out.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password" required>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
        </Field>
        <Field label="Repeat new password" required>
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        {(error || problem) && <p className="text-[13px] font-medium text-rose-600">{error || problem}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Save new password
        </Button>
        {error && (
          <p className="text-center text-[14px]">
            <Link to="/forgot-password" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">Ask for a new link</Link>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
