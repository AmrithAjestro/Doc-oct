import React, { useState } from 'react';
import { Plus, Trash2, Save, Printer, Pill } from 'lucide-react';
import { Button, Field, Input, Textarea, IconButton, EmptyState } from '../lib/ui';
import api, { errorMessage, unwrap } from '../lib/api';
import { toast } from '../lib/toast';
import { dateOnly } from '../lib/format';

const EMPTY_MED = { name: '', dosage: '', frequency: '', duration: '', instructions: '' };

export function PrescriptionView({ prescription }) {
  if (!prescription) return <EmptyState icon={Pill} title="No prescription yet" hint="The doctor adds it during or after the visit." />;
  const p = prescription;
  return (
    <div className="space-y-4">
      {p.diagnosis && (
        <div>
          <div className="label-eyebrow mb-1">Diagnosis</div>
          <p className="text-[13px] leading-relaxed text-ink">{p.diagnosis}</p>
        </div>
      )}
      {p.medicines?.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Dosage</th>
                <th>Frequency</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {p.medicines.map((m, i) => (
                <tr key={i}>
                  <td>
                    <div className="font-semibold text-ink">{m.name}</div>
                    {m.instructions && <div className="text-[11px] text-ink-3">{m.instructions}</div>}
                  </td>
                  <td className="text-ink-2">{m.dosage || '—'}</td>
                  <td className="text-ink-2">{m.frequency || '—'}</td>
                  <td className="text-ink-2">{m.duration || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.advice && (
        <div>
          <div className="label-eyebrow mb-1">Advice</div>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">{p.advice}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <span>{p.followUpDate ? `Follow-up on ${dateOnly(p.followUpDate)}` : 'No follow-up scheduled'}</span>
        <Button size="sm" icon={Printer} onClick={() => window.print()} className="print:hidden">
          Print
        </Button>
      </div>
    </div>
  );
}

export function PrescriptionForm({ appointmentId, prescription, onSaved }) {
  const [form, setForm] = useState(() => ({
    diagnosis: prescription?.diagnosis || '',
    advice: prescription?.advice || '',
    followUpDate: prescription?.followUpDate || '',
    medicines: prescription?.medicines?.length ? prescription.medicines.map((m) => ({ ...EMPTY_MED, ...m })) : [{ ...EMPTY_MED }]
  }));
  const [saving, setSaving] = useState(false);

  const setMed = (i, key, value) => setForm((f) => ({ ...f, medicines: f.medicines.map((m, j) => (j === i ? { ...m, [key]: value } : m)) }));
  const medicines = form.medicines.filter((m) => m.name.trim());
  const canSave = form.diagnosis.trim() || form.advice.trim() || medicines.length;

  const save = async () => {
    setSaving(true);
    try {
      const updated = unwrap(
        await api.put(`/appointments/${appointmentId}/prescription`, {
          diagnosis: form.diagnosis,
          advice: form.advice,
          followUpDate: form.followUpDate || null,
          medicines
        })
      );
      toast.success(prescription ? 'Prescription updated' : 'Prescription saved — the patient has been notified');
      onSaved?.(updated);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Diagnosis">
        <Textarea value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} rows={2} maxLength={1000} />
      </Field>
      <div>
        <div className="label-eyebrow mb-2">Medicines</div>
        <div className="space-y-2">
          {form.medicines.map((m, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[2fr_1fr_1.4fr_1fr_auto]">
              <Input placeholder="Name" value={m.name} onChange={(e) => setMed(i, 'name', e.target.value)} className="col-span-2 sm:col-span-1" />
              <Input placeholder="Dosage" value={m.dosage || ''} onChange={(e) => setMed(i, 'dosage', e.target.value)} />
              <Input placeholder="Frequency" value={m.frequency || ''} onChange={(e) => setMed(i, 'frequency', e.target.value)} />
              <Input placeholder="Duration" value={m.duration || ''} onChange={(e) => setMed(i, 'duration', e.target.value)} />
              <IconButton
                icon={Trash2}
                label="Remove medicine"
                tone="danger"
                onClick={() => setForm((f) => ({ ...f, medicines: f.medicines.length > 1 ? f.medicines.filter((_, j) => j !== i) : [{ ...EMPTY_MED }] }))}
              />
              <Input placeholder="Instructions (e.g. after food)" value={m.instructions || ''} onChange={(e) => setMed(i, 'instructions', e.target.value)} className="col-span-2 sm:col-span-5" />
            </div>
          ))}
        </div>
        <Button size="sm" icon={Plus} className="mt-2" onClick={() => setForm((f) => ({ ...f, medicines: [...f.medicines, { ...EMPTY_MED }] }))} disabled={form.medicines.length >= 30}>
          Add medicine
        </Button>
      </div>
      <Field label="Advice">
        <Textarea value={form.advice} onChange={(e) => setForm({ ...form, advice: e.target.value })} rows={3} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Follow-up date" className="w-48">
          <Input type="date" value={form.followUpDate || ''} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
        </Field>
        <Button variant="primary" icon={Save} loading={saving} disabled={!canSave} onClick={save}>
          {prescription ? 'Update prescription' : 'Save prescription'}
        </Button>
      </div>
    </div>
  );
}
