import React, { useEffect, useState } from 'react';
import { Save, Upload, Trash2, ImageIcon } from 'lucide-react';
import { PageHeader, Panel, SectionHeader, Field, Input, Select, SegmentedControl, Button, Spinner, askConfirm } from '../../lib/ui';
import { ErrorBanner, FeeBreakdown, Notice } from '../../components/common';
import FilePicker from '../../components/FilePicker';
import { useAsync } from '../../lib/useAsync';
import { useBranding } from '../../context/BrandingContext';
import api, { assetUrl, errorMessage, unwrap } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fileProblem, isEmail, LOGO_TYPES } from '../../lib/validation';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function Branding({ settings, onSaved }) {
  const [form, setForm] = useState({ appName: settings.appName, tagline: settings.tagline || '', supportEmail: settings.supportEmail || '' });
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(null);
  const logoProblem = logo ? fileProblem(logo, LOGO_TYPES, 2) : null;
  const problem = form.appName.trim().length < 2 ? 'App name is required' : form.supportEmail && !isEmail(form.supportEmail) ? 'Support email is not valid' : null;

  useEffect(() => {
    if (!logo || logoProblem) return setPreview(null);
    const url = URL.createObjectURL(logo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo, logoProblem]);

  const save = async () => {
    setSaving('details');
    try {
      onSaved(unwrap(await api.put('/admin/settings', form)));
      toast.success('Branding saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const uploadLogo = async () => {
    setSaving('logo');
    const data = new FormData();
    data.append('logo', logo);
    try {
      onSaved(unwrap(await api.put('/admin/settings/logo', data)));
      setLogo(null);
      toast.success('Logo updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const removeLogo = async () => {
    if (!(await askConfirm('The default icon will be shown instead.', { title: 'Remove logo?', confirmLabel: 'Remove', danger: true }))) return;
    try {
      onSaved(unwrap(await api.delete('/admin/settings/logo')));
      toast.success('Logo removed');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const current = preview || assetUrl(settings.logoUrl);

  return (
    <Panel className="space-y-5">
      <SectionHeader title="Branding" subtitle="Shown in the sidebar, sign-in pages and browser tab." />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-subtle">
          {current ? <img src={current} alt="Logo" className="h-full w-full object-contain p-2" /> : <ImageIcon className="h-8 w-8 text-ink-3" />}
        </div>
        <div className="flex-1 space-y-2">
          <FilePicker file={logo} onChange={setLogo} accept=".png,.jpg,.jpeg,.webp" hint="PNG, JPG or WEBP · max 2 MB · square works best" error={logoProblem} />
          <div className="flex justify-end gap-2">
            {settings.logoUrl && !logo && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={removeLogo} className="hover:!text-rose-600">
                Remove logo
              </Button>
            )}
            <Button size="sm" variant="primary" icon={Upload} disabled={!logo || Boolean(logoProblem)} loading={saving === 'logo'} onClick={uploadLogo}>
              Upload logo
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="App name" required>
          <Input value={form.appName} maxLength={60} onChange={(e) => setForm({ ...form, appName: e.target.value })} />
        </Field>
        <Field label="Support email">
          <Input type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
        </Field>
      </div>
      <Field label="Tagline" hint="Headline on the landing and sign-in pages">
        <Input value={form.tagline} maxLength={160} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
      </Field>
      {problem && <p className="text-[11px] font-semibold text-rose-500">{problem}</p>}
      <div className="flex justify-end">
        <Button variant="primary" icon={Save} loading={saving === 'details'} disabled={Boolean(problem)} onClick={save}>
          Save branding
        </Button>
      </div>
    </Panel>
  );
}

function Commission({ settings, onSaved }) {
  const [form, setForm] = useState({ commissionType: settings.commissionType, commissionValue: settings.commissionValue, currency: settings.currency });
  const [exampleFee, setExampleFee] = useState(500);
  const [saving, setSaving] = useState(false);
  const value = Number(form.commissionValue);
  const problem =
    form.commissionValue === '' || !(value >= 0)
      ? 'Enter a value of 0 or more'
      : form.commissionType === 'percentage' && value > 100
        ? 'A percentage cannot exceed 100'
        : null;
  const fee = Number(exampleFee) || 0;
  const commission = problem ? 0 : form.commissionType === 'percentage' ? round2((fee * value) / 100) : round2(value);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(unwrap(await api.put('/admin/settings', { ...form, commissionValue: value })));
      toast.success('Commission saved — applies to new bookings');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-5">
      <SectionHeader title="Commission & currency" subtitle="Patients pay the doctor’s fee plus this platform commission." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type">
          <SegmentedControl
            options={[
              { value: 'percentage', label: '% of fee' },
              { value: 'flat', label: 'Flat amount' }
            ]}
            value={form.commissionType}
            onChange={(v) => setForm({ ...form, commissionType: v })}
          />
        </Field>
        <Field label={form.commissionType === 'percentage' ? 'Percentage' : 'Amount'} error={problem}>
          <Input type="number" min="0" step="0.01" max={form.commissionType === 'percentage' ? 100 : undefined} value={form.commissionValue} onChange={(e) => setForm({ ...form, commissionValue: e.target.value })} />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 rounded-xl bg-subtle p-4 sm:grid-cols-[180px_1fr] sm:items-center">
        <Field label="Example doctor fee">
          <Input type="number" min="0" value={exampleFee} onChange={(e) => setExampleFee(e.target.value)} />
        </Field>
        <FeeBreakdown doctorFee={fee} commission={commission} totalFee={round2(fee + commission)} />
      </div>
      <Notice tone="info">Existing appointments keep the price they were booked at.</Notice>
      <div className="flex justify-end">
        <Button variant="primary" icon={Save} loading={saving} disabled={Boolean(problem)} onClick={save}>
          Save commission
        </Button>
      </div>
    </Panel>
  );
}

export default function AdminSettings() {
  const branding = useBranding();
  const { data, loading, error, reload, setData } = useAsync(() => api.get('/admin/settings'), []);
  const onSaved = (s) => {
    setData(s);
    branding.refresh();
  };
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Platform branding and the commission added to every booking." />
      <div className="space-y-5">
        <Branding settings={data} onSaved={onSaved} />
        <Commission settings={data} onSaved={onSaved} />
      </div>
    </div>
  );
}
