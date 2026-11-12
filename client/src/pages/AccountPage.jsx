import React, { useState } from 'react';
import { Save, KeyRound, FileText, Upload, ExternalLink, LogOut, Trash2 } from 'lucide-react';
import { PageHeader, Panel, SectionHeader, Field, Input, Textarea, Button } from '../lib/ui';
import { Avatar, DoctorStatusBadge, Notice } from '../components/common';
import FilePicker from '../components/FilePicker';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage, unwrap } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { askConfirm } from '../lib/ui';
import { toast } from '../lib/toast';
import { CERTIFICATE_TYPES, LOGO_TYPES, fileProblem, passwordProblem, phoneProblem } from '../lib/validation';
import { ROLE_LABEL } from '../lib/format';
import { openCertificate } from '../lib/files';

function PersonalDetails() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '' });
  const [saving, setSaving] = useState(false);
  const problem = form.name.trim().length < 2 ? 'Enter your name' : phoneProblem(form.phone);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/auth/me', form);
      setUser((u) => ({ ...u, ...res.data.data }));
      toast.success('Details saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <SectionHeader title="Personal details" subtitle={`${ROLE_LABEL[user.role]} · ${user.email}`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
      {problem && <p className="text-[11px] font-semibold text-rose-500">{problem}</p>}
      <div className="flex justify-end">
        <Button variant="primary" icon={Save} loading={saving} disabled={Boolean(problem)} onClick={save}>
          Save
        </Button>
      </div>
    </Panel>
  );
}

function ChangePassword() {
  const { startSession } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const problem = form.newPassword && (passwordProblem(form.newPassword) || (form.confirm !== form.newPassword && 'Passwords do not match'));

  const save = async () => {
    setSaving(true);
    try {
      // Other devices are signed out; this one continues with the new token.
      startSession(unwrap(await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword })));
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <SectionHeader title="Password" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
      </div>
      {problem && <p className="text-[11px] font-semibold text-rose-500">{problem}</p>}
      <div className="flex justify-end">
        <Button icon={KeyRound} loading={saving} disabled={!form.currentPassword || !form.newPassword || Boolean(problem)} onClick={save}>
          Change password
        </Button>
      </div>
    </Panel>
  );
}

function ProfessionalProfile() {
  const { user, refresh } = useAuth();
  const p = user.doctorProfile;
  const [form, setForm] = useState({
    specialization: p.specialization || '',
    qualification: p.qualification || '',
    experienceYears: p.experienceYears ?? 0,
    fee: p.fee ?? 0,
    clinicAddress: p.clinicAddress || '',
    languages: p.languages || '',
    clinicHours: p.clinicHours || '',
    bio: p.bio || ''
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/doctor/profile', { ...form, experienceYears: Number(form.experienceYears), fee: Number(form.fee) });
      await refresh();
      toast.success('Profile saved. New fees apply to new bookings only.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <SectionHeader title="Professional profile" subtitle="Shown to patients. Fee changes never affect existing bookings." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Specialization" required>
          <Input value={form.specialization} onChange={set('specialization')} />
        </Field>
        <Field label="Qualification">
          <Input value={form.qualification} onChange={set('qualification')} />
        </Field>
        <Field label="Experience (years)">
          <Input type="number" min="0" max="70" value={form.experienceYears} onChange={set('experienceYears')} />
        </Field>
        <Field label="Consultation fee" required>
          <Input type="number" min="0" value={form.fee} onChange={set('fee')} />
        </Field>
      </div>
      <Field label="Clinic address">
        <Input value={form.clinicAddress} onChange={set('clinicAddress')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Languages spoken" hint="e.g. English, Hindi, Kannada">
          <Input value={form.languages} onChange={set('languages')} maxLength={200} />
        </Field>
        <Field label="Clinic hours" hint="e.g. Mon-Sat, 10 am - 6 pm">
          <Input value={form.clinicHours} onChange={set('clinicHours')} maxLength={200} />
        </Field>
      </div>
      <Field label="About you">
        <Textarea value={form.bio} onChange={set('bio')} rows={3} maxLength={2000} />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" icon={Save} loading={saving} disabled={form.specialization.trim().length < 2 || form.fee === '' || Number(form.fee) < 0} onClick={save}>
          Save profile
        </Button>
      </div>
    </Panel>
  );
}

function ProfilePhoto() {
  const { user, refresh } = useAuth();
  const p = user.doctorProfile;
  const [busy, setBusy] = useState(false);
  const input = React.useRef(null);

  const upload = async (file) => {
    if (!file) return;
    const problem = fileProblem(file, LOGO_TYPES, 2);
    if (problem) return toast.error(problem);
    setBusy(true);
    const form = new FormData();
    form.append('photo', file);
    try {
      await api.put('/doctor/profile/photo', form);
      await refresh();
      toast.success('Photo updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    if (!(await askConfirm('Patients will see your initials instead.', { title: 'Remove photo?', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await api.delete('/doctor/profile/photo');
      await refresh();
      toast.success('Photo removed');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Panel className="flex flex-wrap items-center gap-5">
      <Avatar name={user.name} photoUrl={p.photoUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <SectionHeader title="Profile photo" subtitle="A clear, friendly photo helps patients choose you. PNG, JPG or WEBP, up to 2 MB." />
      </div>
      <div className="flex gap-2">
        <input ref={input} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <Button icon={Upload} loading={busy} onClick={() => input.current?.click()}>
          {p.photoUrl ? 'Change photo' : 'Upload photo'}
        </Button>
        {p.photoUrl && <Button variant="ghost" icon={Trash2} onClick={remove}>Remove</Button>}
      </div>
    </Panel>
  );
}

function Sessions() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const signOutAll = async () => {
    if (!(await askConfirm('You will be signed out here and on every other phone or computer.', { title: 'Sign out everywhere?', confirmLabel: 'Sign out everywhere', danger: true }))) return;
    try {
      await api.post('/auth/logout-all');
    } catch (err) {
      return toast.error(errorMessage(err));
    }
    logout();
    navigate('/login');
  };
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4">
      <SectionHeader title="Signed-in devices" subtitle="Lost a phone or used a shared computer? Sign out of every device at once." />
      <Button icon={LogOut} onClick={signOutAll}>Sign out everywhere</Button>
    </Panel>
  );
}

function Certificate() {
  const { user, refresh } = useAuth();
  const p = user.doctorProfile;
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const problem = file ? fileProblem(file, CERTIFICATE_TYPES, 5) : null;

  const upload = async () => {
    setSaving(true);
    const form = new FormData();
    form.append('certificate', file);
    try {
      await api.put('/doctor/profile/certificate', form);
      await refresh();
      setFile(null);
      toast.success('Certificate uploaded — your profile is back in the review queue');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <SectionHeader title="Registration certificate" actions={<DoctorStatusBadge status={p.status} />} />
      {p.status === 'rejected' && (
        <Notice tone="danger" title="Not approved">
          {p.rejectionReason || 'No reason given.'} Upload a corrected certificate to be reviewed again.
        </Notice>
      )}
      {p.status === 'pending' && <Notice tone="warning">Your certificate is being reviewed. You will be notified once it is approved.</Notice>}
      {p.hasCertificate && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-subtle px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink">
            <FileText className="h-4 w-4 shrink-0 text-ink-3" />
            <span className="truncate">{p.certificateName || 'certificate'}</span>
          </span>
          <Button size="sm" icon={ExternalLink} onClick={() => openCertificate(p.id).catch((e) => toast.error(errorMessage(e)))}>
            View
          </Button>
        </div>
      )}
      {p.status !== 'approved' ? (
        <>
          <FilePicker file={file} onChange={setFile} accept=".pdf,.jpg,.jpeg,.png" hint="PDF, JPG or PNG · max 5 MB" error={problem} />
          <div className="flex justify-end">
            <Button variant="primary" icon={Upload} loading={saving} disabled={!file || Boolean(problem)} onClick={upload}>
              Upload new certificate
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-ink-2">Your profile is verified. Contact the administrator if your certificate needs to change.</p>
      )}
    </Panel>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const isDoctor = user.role === 'doctor';
  return (
    <div className="max-w-3xl">
      <PageHeader title={isDoctor ? 'My profile' : 'Account'} />
      <div className="space-y-5">
        {isDoctor && <ProfilePhoto />}
        {isDoctor && <Certificate />}
        <PersonalDetails />
        {isDoctor && <ProfessionalProfile />}
        <ChangePassword />
        <Sessions />
      </div>
    </div>
  );
}
