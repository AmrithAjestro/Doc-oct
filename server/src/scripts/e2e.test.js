/**
 * End-to-end check of the booking rules against a running API (npm run dev, then npm run test:e2e).
 * Creates its own doctor and patients, simulates the passing of time by moving rows in the
 * database, and deletes everything it created at the end.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const config = require('../config/config');
const { sequelize, User, Appointment, Slot, Notification } = require('../models');
const scheduler = require('../jobs/scheduler');

const API = process.env.API_URL || `http://localhost:${config.PORT}/api`;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const stamp = Date.now();
const created = [];
let passed = 0;

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + url, { method, headers, body: form || (body && JSON.stringify(body)) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    console.error(`  ✘ ${name}\n    ${err.message}`);
    throw err;
  }
}

/** Local evening times on day +n, clear of the demo seed slots. */
const at = (days, hour, minute = 0) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const slot = (start, minutes = 30) => ({ startAt: start.toISOString(), endAt: new Date(start.getTime() + minutes * 60e3).toISOString() });

/** Pretend time passed: move an appointment (and its slot) to a new start. */
async function shiftAppointment(id, newStart) {
  const appt = await Appointment.findByPk(id);
  const end = new Date(newStart.getTime() + (appt.endAt - appt.startAt));
  await Slot.update({ startAt: newStart, endAt: end }, { where: { id: appt.slotId } });
  await appt.update({ startAt: newStart, endAt: end });
}

async function main() {
  console.log(`Running against ${API}\n`);
  const admin = await call('POST', '/auth/login', { body: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD } });
  assert.equal(admin.status, 200, 'admin login (run npm run db:seed first)');

  let doctor;
  let doctorToken;
  await step('doctor registers with a certificate upload', async () => {
    const form = new FormData();
    Object.entries({ name: 'Dr. Test Doctor', email: `e2e.doctor.${stamp}@test.local`, password: 'Test@1234', specialization: 'General Medicine', fee: '1000', experienceYears: '5' }).forEach(([k, v]) =>
      form.append(k, v)
    );
    form.append('certificate', new Blob([fs.readFileSync(path.join(config.UPLOAD_DIR, 'certificates', 'demo-certificate.pdf'))], { type: 'application/pdf' }), 'cert.pdf');
    const res = await call('POST', '/auth/register/doctor', { form });
    assert.equal(res.status, 201, res.message);
    assert.equal(res.data.user.name, 'Test Doctor', 'leading "Dr." stripped');
    assert.equal(res.data.user.doctorProfile.status, 'pending');
    doctor = res.data.user;
    doctorToken = res.data.token;
    created.push(doctor.id);
  });

  await step('rejects a certificate of the wrong type', async () => {
    const form = new FormData();
    Object.entries({ name: 'Bad Upload', email: `e2e.bad.${stamp}@test.local`, password: 'Test@1234', specialization: 'X Ray', fee: '10' }).forEach(([k, v]) => form.append(k, v));
    form.append('certificate', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'virus.exe');
    const res = await call('POST', '/auth/register/doctor', { form });
    assert.equal(res.status, 400);
    assert.equal(res.code, 'INVALID_FILE_TYPE');
  });

  await step('unapproved doctor cannot add slots', async () => {
    const res = await call('POST', '/doctor/slots', { token: doctorToken, body: { slots: [slot(at(3, 20))] } });
    assert.equal(res.status, 403);
    assert.equal(res.code, 'DOCTOR_NOT_APPROVED');
  });

  await step('admin approves the doctor', async () => {
    const res = await call('PATCH', `/admin/doctors/${doctor.doctorProfile.id}/status`, { token: admin.data.token, body: { status: 'approved' } });
    assert.equal(res.status, 200, res.message);
  });

  const soon = new Date(Math.ceil((Date.now() + 2 * HOUR) / (5 * 60e3)) * 5 * 60e3);
  let slots;
  await step('doctor adds slots; overlapping and past ones are skipped', async () => {
    const res = await call('POST', '/doctor/slots', {
      token: doctorToken,
      body: { slots: [slot(soon), slot(at(3, 20)), slot(at(3, 20, 15)), slot(at(3, 21)), slot(at(4, 20)), slot(at(5, 20)), slot(new Date(Date.now() - HOUR))] }
    });
    assert.equal(res.status, 201, res.message);
    assert.equal(res.data.created.length, 5);
    assert.equal(res.data.skipped.length, 2);
    slots = res.data.created.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  });
  const [sSoon, sA, sB, sC, sD] = slots;

  await step('fee shown to patients = doctor fee + commission', async () => {
    const [res, settings] = await Promise.all([call('GET', `/doctors/${doctor.doctorProfile.id}`), call('GET', '/settings/public')]);
    const { commissionType, commissionValue } = settings.data;
    const expected = commissionType === 'flat' ? 1000 + commissionValue : 1000 + (1000 * commissionValue) / 100;
    assert.equal(res.data.pricing.totalFee, expected);
  });

  const patients = [];
  await step('two patients register', async () => {
    for (const n of [1, 2]) {
      const res = await call('POST', '/auth/register', { body: { name: `E2E Patient ${n}`, email: `e2e.patient${n}.${stamp}@test.local`, password: 'Test@1234' } });
      assert.equal(res.status, 201, res.message);
      patients.push(res.data);
      created.push(res.data.user.id);
    }
  });
  const [p1, p2] = patients;

  let apptA;
  await step('concurrent bookings of one slot: exactly one wins', async () => {
    const attempts = await Promise.all([p1, p2, p1, p2, p1].map((p) => call('POST', '/appointments', { token: p.token, body: { slotId: sA.id } })));
    const wins = attempts.filter((r) => r.status === 201);
    assert.equal(wins.length, 1, `expected 1 success, got ${attempts.map((r) => r.status)}`);
    assert.ok(attempts.filter((r) => r.status !== 201).every((r) => r.status === 409));
    apptA = wins[0].data;
  });
  const owner = apptA.patient.id === p1.user.id ? p1 : p2;
  const other = owner === p1 ? p2 : p1;

  await step('booking >24h ahead waits for patient confirmation; price is snapshotted', async () => {
    assert.equal(apptA.status, 'pending_confirmation');
    assert.equal(apptA.actions.confirm, true);
    assert.ok(apptA.totalFee > apptA.doctorFee);
  });

  let apptSoon;
  await step('booking inside 24h is confirmed at once and cannot be cancelled or rescheduled', async () => {
    const res = await call('POST', '/appointments', { token: other.token, body: { slotId: sSoon.id } });
    assert.equal(res.status, 201, res.message);
    assert.equal(res.data.status, 'confirmed');
    apptSoon = res.data;
    const cancel = await call('POST', `/appointments/${apptSoon.id}/cancel`, { token: other.token, body: {} });
    assert.equal(cancel.status, 422);
    assert.equal(cancel.code, 'LOCK_WINDOW');
    const preview = await call('GET', `/appointments/${apptSoon.id}/reschedule-preview`, { token: other.token });
    assert.equal(preview.code, 'LOCK_WINDOW');
  });

  await step('patients cannot see each other\'s appointments', async () => {
    const res = await call('GET', `/appointments/${apptSoon.id}`, { token: owner.token });
    assert.equal(res.status, 404);
  });

  await step('reschedule: preview offers the next free slot, confirming moves it', async () => {
    const preview = await call('GET', `/appointments/${apptA.id}/reschedule-preview`, { token: owner.token });
    assert.equal(preview.status, 200, preview.message);
    assert.equal(preview.data.nextSlot.id, sB.id);
    const res = await call('POST', `/appointments/${apptA.id}/reschedule`, { token: owner.token, body: { slotId: sB.id } });
    assert.equal(res.status, 200, res.message);
    assert.equal(res.data.slotId, sB.id);
    assert.equal(res.data.status, 'confirmed');
    assert.equal((await Slot.findByPk(sA.id)).status, 'available', 'old slot released');
  });

  await step('patient cancels outside the lock window; slot reopens', async () => {
    const res = await call('POST', `/appointments/${apptA.id}/cancel`, { token: owner.token, body: { reason: 'Travelling' } });
    assert.equal(res.status, 200, res.message);
    assert.equal(res.data.status, 'cancelled');
    assert.equal((await Slot.findByPk(sB.id)).status, 'available');
  });

  await step('unconfirmed appointment is auto-moved to the next slot when its deadline passes', async () => {
    const booked = await call('POST', '/appointments', { token: owner.token, body: { slotId: sC.id } });
    assert.equal(booked.status, 201, booked.message);
    await shiftAppointment(booked.data.id, new Date(Date.now() + 23 * HOUR)); // deadline (start − 24h) now passed
    await scheduler.tick();
    const appt = await Appointment.findByPk(booked.data.id);
    // sA was released by the earlier reschedule and is the first free slot ≥ 48 h ahead.
    assert.equal(appt.slotId, sA.id);
    assert.equal((await Slot.findByPk(sC.id)).status, 'available', 'old slot released');
    assert.equal(appt.status, 'pending_confirmation');
    assert.equal(appt.autoRescheduleCount, 1);
    assert.ok(await Notification.count({ where: { userId: owner.user.id, type: 'booking_auto_rescheduled' } }));
  });

  await step('doctor can complete only after the start, then add a prescription', async () => {
    const early = await call('POST', `/appointments/${apptSoon.id}/complete`, { token: doctorToken, body: {} });
    assert.equal(early.code, 'NOT_STARTED');
    await shiftAppointment(apptSoon.id, new Date(Date.now() - 10 * 60e3));
    const rx = await call('PUT', `/appointments/${apptSoon.id}/prescription`, {
      token: doctorToken,
      body: { diagnosis: 'Viral fever', medicines: [{ name: 'Paracetamol', dosage: '500 mg', frequency: 'Thrice daily', duration: '3 days' }] }
    });
    assert.equal(rx.status, 200, rx.message);
    const done = await call('POST', `/appointments/${apptSoon.id}/complete`, { token: doctorToken, body: {} });
    assert.equal(done.status, 200, done.message);
    assert.equal(done.data.status, 'completed');
    const seen = await call('GET', `/appointments/${apptSoon.id}`, { token: other.token });
    assert.equal(seen.data.prescription.medicines[0].name, 'Paracetamol');
  });

  await step('patients received notifications', async () => {
    const res = await call('GET', '/notifications', { token: other.token });
    assert.ok(res.data.length >= 3, `got ${res.data.length}`);
  });

  await step('a patient cannot act as a doctor or an admin', async () => {
    assert.equal((await call('GET', '/admin/users', { token: owner.token })).status, 403);
    assert.equal((await call('POST', `/appointments/${apptSoon.id}/complete`, { token: owner.token, body: {} })).status, 403);
  });

  console.log(`\n${passed} checks passed.`);
}

main()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(async () => {
    if (created.length) await User.destroy({ where: { id: created } });
    await sequelize.close();
  });
