/**
 * End-to-end checks for the clinic features added after the first suite: walk-ins and emergencies,
 * delay notices and the "running late" window, "can't attend", the waitlist, reviews, doctor photos,
 * password reset and signing out everywhere. Runs against a running API (npm run dev), creates its own
 * doctor and patients, and deletes everything it created at the end.
 *
 *   npm run test:e2e:clinic
 */
const crypto = require('crypto');
const assert = require('assert/strict');
const config = require('../config/config');
const { sequelize, User, Appointment, Slot } = require('../models');

const API = process.env.API_URL || `http://localhost:${config.PORT}/api`;
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const stamp = Date.now();
const createdUsers = [];
let passed = 0;

// A 1x1 PNG, for the photo upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

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

const minutesFromNow = (m) => new Date(Math.ceil((Date.now() + m * MIN) / (5 * MIN)) * 5 * MIN);
const slot = (start, minutes = 30) => ({ startAt: start.toISOString(), endAt: new Date(start.getTime() + minutes * MIN).toISOString() });
const notificationsOf = async (token, type) => (await call('GET', '/notifications?limit=50', { token })).data.filter((n) => !type || n.type === type);
const ok = (res, status = 200) => assert.equal(res.status, status, `${res.status} ${res.code || ''} ${res.message || ''}`);

async function main() {
  console.log(`Running clinic checks against ${API}\n`);
  const admin = await call('POST', '/auth/login', { body: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD } });
  ok(admin);

  // setup
  let doctor;
  let dt; // doctor token
  await step('setup: a doctor registers and is approved', async () => {
    const form = new FormData();
    const fields = { name: 'Clinic Test', email: `e2e.clinic.doctor.${stamp}@test.local`, password: 'Test@1234', specialization: 'General Medicine', fee: '500', experienceYears: '8' };
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    form.append('certificate', new Blob([PDF], { type: 'application/pdf' }), 'cert.pdf');
    const res = await call('POST', '/auth/register/doctor', { form });
    ok(res, 201);
    doctor = res.data.user;
    dt = res.data.token;
    createdUsers.push(doctor.id);
    ok(await call('PATCH', `/admin/doctors/${doctor.doctorProfile.id}/status`, { token: admin.data.token, body: { status: 'approved' } }));
  });
  const doctorId = doctor.doctorProfile.id;

  const P = {};
  await step('setup: three patients register', async () => {
    for (const [key, phone] of [['a', '+91 90000 11111'], ['b', '+91 90000 22222'], ['c', '+91 90000 33333']]) {
      const res = await call('POST', '/auth/register', { body: { name: `Clinic Patient ${key.toUpperCase()}`, email: `e2e.clinic.${key}.${stamp}@test.local`, phone, password: 'Test@1234' } });
      ok(res, 201);
      P[key] = { token: res.data.token, id: res.data.user.id, email: res.data.user.email };
      createdUsers.push(res.data.user.id);
    }
  });

  let S;
  await step('setup: doctor publishes slots (soon, later today, tomorrow, in 3 days)', async () => {
    const tomorrow = new Date(Date.now() + DAY);
    tomorrow.setHours(21, 0, 0, 0);
    const res = await call('POST', '/doctor/slots', {
      token: dt,
      body: { slots: [slot(minutesFromNow(20)), slot(minutesFromNow(60)), slot(tomorrow), slot(new Date(tomorrow.getTime() + 30 * MIN)), slot(new Date(tomorrow.getTime() + 2 * DAY))] }
    });
    ok(res, 201);
    const [soon, later, tmrA, tmrB, day3] = res.data.created.sort((x, y) => new Date(x.startAt) - new Date(y.startAt));
    S = { soon, later, tmrA, tmrB, day3 };
  });

  // doctor profile
  await step('doctor profile: photo upload is public; a fake image is refused', async () => {
    const form = new FormData();
    form.append('photo', new Blob([PNG], { type: 'image/png' }), 'me.png');
    const res = await call('PUT', '/doctor/profile/photo', { token: dt, form });
    ok(res);
    assert.ok(res.data.photoUrl?.startsWith('/uploads/photos/'));
    const img = await fetch(API.replace(/\/api$/, '') + res.data.photoUrl);
    assert.equal(img.status, 200, 'photo is served');

    const bad = new FormData();
    bad.append('photo', new Blob(['not really a png'], { type: 'image/png' }), 'fake.png');
    const r2 = await call('PUT', '/doctor/profile/photo', { token: dt, form: bad });
    assert.equal(r2.code, 'INVALID_FILE_CONTENT');
  });

  await step('doctor profile: languages and clinic hours are shown to patients', async () => {
    ok(await call('PATCH', '/doctor/profile', { token: dt, body: { languages: 'English, Hindi', clinicHours: 'Mon-Sat, 10 am - 6 pm' } }));
    const pub = await call('GET', `/doctors/${doctorId}`);
    assert.equal(pub.data.languages, 'English, Hindi');
    assert.equal(pub.data.clinicHours, 'Mon-Sat, 10 am - 6 pm');
    assert.equal(pub.data.ratingCount, 0);
  });

  // bookings
  let apptA;
  let apptB;
  await step('patient A books a visit in 20 minutes (inside 24 h: confirmed and locked)', async () => {
    const res = await call('POST', '/appointments', { token: P.a.token, body: { slotId: S.soon.id } });
    ok(res, 201);
    apptA = res.data;
    assert.equal(apptA.status, 'confirmed');
    assert.equal(apptA.isLocked, true);
    assert.equal(apptA.actions.cancel, false);
  });
  await step('patient B books tomorrow', async () => {
    const res = await call('POST', '/appointments', { token: P.b.token, body: { slotId: S.tmrA.id } });
    ok(res, 201);
    apptB = res.data;
  });
  await step('patient C joins the waitlist for this doctor', async () => {
    ok(await call('POST', `/doctors/${doctorId}/waitlist`, { token: P.c.token, body: {} }), 201);
    const mine = await call('GET', '/waitlist', { token: P.c.token });
    assert.equal(mine.data.length, 1);
  });

  // walk-ins
  let walkIn;
  await step('emergency walk-in for a new patient: visit starts now, no commission, overlapping booking reported', async () => {
    const res = await call('POST', '/appointments/walk-in', {
      token: dt,
      body: { name: 'Walk In Person', phone: '98450 55555', email: `e2e.clinic.walkin.${stamp}@test.local`, reason: 'Chest pain', isEmergency: true, durationMinutes: 45 }
    });
    ok(res, 201);
    assert.equal(res.data.patientCreated, true);
    assert.deepEqual(res.data.affected.map((x) => x.id), [apptA.id], 'only the booking during the emergency');
    const created = await User.findOne({ where: { email: `e2e.clinic.walkin.${stamp}@test.local` } });
    createdUsers.push(created.id);
    walkIn = (await call('GET', `/appointments/${res.data.appointmentId}`, { token: dt })).data;
    assert.equal(walkIn.visitType, 'walk_in');
    assert.equal(walkIn.isEmergency, true);
    assert.equal(walkIn.status, 'confirmed');
    assert.equal(walkIn.commission, 0);
    assert.equal(walkIn.totalFee, 500);
    assert.equal(walkIn.actions.complete, true);
    assert.equal(walkIn.actions.prescribe, true);
    assert.equal(walkIn.actions.noShow, false);
    assert.equal(walkIn.actions.unavailable, false);
  });

  await step('walk-in for an existing patient is matched by phone, however it is written', async () => {
    const res = await call('POST', '/appointments/walk-in', { token: dt, body: { name: 'Someone', phone: '+919000011111', isEmergency: false, durationMinutes: 15 } });
    ok(res, 201);
    assert.equal(res.data.patientCreated, false);
    const appt = await Appointment.findByPk(res.data.appointmentId);
    assert.equal(appt.userId, P.a.id);
    await appt.destroy(); // keep patient A's timeline simple for the next steps
  });

  await step('patients cannot record walk-ins', async () => {
    const res = await call('POST', '/appointments/walk-in', { token: P.a.token, body: { name: 'X Y', phone: '9999999999' } });
    assert.equal(res.status, 403);
  });

  // delay and running late
  await step('delay notice: patient is told, may now cancel or move, doctor shows as running late', async () => {
    const res = await call('POST', '/appointments/notify-delay', { token: dt, body: { appointmentIds: [apptA.id], minutes: 40 } });
    ok(res);
    assert.equal(res.data.notified, 1);
    const [n] = await notificationsOf(P.a.token, 'doctor_delayed');
    assert.ok(n && n.message.includes('40 minutes'));
    const a = (await call('GET', `/appointments/${apptA.id}`, { token: P.a.token })).data;
    assert.equal(a.isLocked, false);
    assert.equal(a.actions.cancel, true);
    assert.equal(a.actions.reschedule, true);
    const pub = (await call('GET', `/doctors/${doctorId}`)).data;
    assert.equal(pub.runningLate.minutes, 40);
    assert.ok(new Date(pub.runningLate.until) > new Date(S.later.startAt), 'later-today slot is inside the late window');
  });

  await step('cancelling during the delay keeps the slot blocked and does not alert the waitlist', async () => {
    ok(await call('POST', `/appointments/${apptA.id}/cancel`, { token: P.a.token, body: { reason: 'Cannot wait' } }));
    assert.equal((await Slot.findByPk(S.soon.id)).status, 'blocked');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal((await notificationsOf(P.c.token, 'waitlist_opening')).length, 0);
  });

  await step('"I\'ve caught up" ends the delay; reopening the slot alerts the waitlist', async () => {
    const res = await call('POST', '/doctor/caught-up', { token: dt });
    ok(res);
    assert.equal(res.data.runningLate, null);
    ok(await call('POST', `/doctor/slots/${S.soon.id}/unblock`, { token: dt }));
    await new Promise((r) => setTimeout(r, 800));
    const [n] = await notificationsOf(P.c.token, 'waitlist_opening');
    assert.ok(n, 'patient C was told a time opened');
  });

  let apptC;
  await step('booking with the doctor takes the patient off the waitlist', async () => {
    const res = await call('POST', '/appointments', { token: P.c.token, body: { slotId: S.soon.id } });
    ok(res, 201);
    apptC = res.data;
    assert.equal((await call('GET', '/waitlist', { token: P.c.token })).data.length, 0);
  });

  // can't attend
  await step("can't attend: the visit moves to the next free time at the same price; old slot blocked", async () => {
    const options = await call('GET', `/appointments/${apptB.id}/unavailable-options`, { token: dt });
    ok(options);
    assert.ok(options.data.length >= 1);
    const res = await call('POST', `/appointments/${apptB.id}/doctor-unavailable`, { token: dt, body: { reason: 'Critical emergency' } });
    ok(res);
    assert.equal(res.data.outcome, 'moved');
    const a = res.data.appointment;
    assert.equal(a.totalFee, apptB.totalFee, 'same price');
    assert.equal(a.awaitingPatientReply, true);
    assert.notEqual(a.startAt, apptB.startAt);
    assert.equal((await Slot.findByPk(S.tmrA.id)).status, 'blocked');
    const [n] = await notificationsOf(P.b.token, 'doctor_moved');
    assert.ok(n && n.message.includes('Critical emergency'));
  });

  await step('the patient sees Accept / Choose another time / Cancel, and accepting confirms it', async () => {
    const a = (await call('GET', `/appointments/${apptB.id}`, { token: P.b.token })).data;
    assert.equal(a.actions.confirm, true);
    assert.equal(a.actions.reschedule, true);
    assert.equal(a.actions.cancel, true);
    const res = await call('POST', `/appointments/${apptB.id}/confirm`, { token: P.b.token });
    ok(res);
    assert.equal(res.data.awaitingPatientReply, false);
    assert.equal(res.data.status, 'confirmed');
  });

  await step("can't attend with a slot that is not free is refused", async () => {
    const res = await call('POST', `/appointments/${apptC.id}/doctor-unavailable`, { token: dt, body: { reason: 'Emergency', slotId: S.tmrA.id } });
    assert.equal(res.code, 'SLOT_UNAVAILABLE');
  });

  await step("can't attend with no free time left cancels the visit (never a no-show)", async () => {
    const mine = (await call('GET', '/doctor/slots', { token: dt })).data;
    for (const s of mine.filter((x) => x.status === 'available')) ok(await call('DELETE', `/doctor/slots/${s.id}`, { token: dt }));
    const res = await call('POST', `/appointments/${apptC.id}/doctor-unavailable`, { token: dt, body: { reason: 'Emergency surgery' } });
    ok(res);
    assert.equal(res.data.outcome, 'cancelled');
    assert.equal(res.data.appointment.status, 'cancelled');
    assert.equal(res.data.appointment.cancelledBy, 'doctor');
  });

  // reviews
  await step('reviews: only after a completed visit; the rating shows on the doctor', async () => {
    const early = await call('PUT', `/appointments/${apptB.id}/review`, { token: P.b.token, body: { rating: 5 } });
    assert.equal(early.code, 'NOT_COMPLETED');
    // Pretend the visit happened: move it into the past, then the doctor completes it.
    const appt = await Appointment.findByPk(apptB.id);
    const start = new Date(Date.now() - HOUR);
    await Slot.update({ startAt: start, endAt: new Date(start.getTime() + 30 * MIN) }, { where: { id: appt.slotId } });
    await appt.update({ startAt: start, endAt: new Date(start.getTime() + 30 * MIN) });
    ok(await call('POST', `/appointments/${apptB.id}/complete`, { token: dt, body: {} }));
    ok(await call('PUT', `/appointments/${apptB.id}/review`, { token: P.b.token, body: { rating: 4, comment: 'Kind and clear' } }));
    assert.equal((await call('PUT', `/appointments/${apptB.id}/review`, { token: dt, body: { rating: 1 } })).status, 403, 'doctors cannot review');
    const pub = (await call('GET', `/doctors/${doctorId}`)).data;
    assert.equal(pub.ratingAvg, 4);
    assert.equal(pub.ratingCount, 1);
    const reviews = await call('GET', `/doctors/${doctorId}/reviews`);
    assert.equal(reviews.data[0].author, 'Clinic', 'first name only');
  });

  // accounts / sessions
  await step('forgot password answers the same for known and unknown e-mails', async () => {
    const known = await call('POST', '/auth/forgot-password', { body: { email: P.c.email } });
    const unknown = await call('POST', '/auth/forgot-password', { body: { email: `nobody.${stamp}@test.local` } });
    ok(known);
    assert.equal(known.data.message, unknown.data.message);
  });

  await step('reset link works once, signs in, and revokes older sessions', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    await User.update(
      { resetTokenHash: crypto.createHash('sha256').update(token).digest('hex'), resetTokenExpiresAt: new Date(Date.now() + 10 * MIN) },
      { where: { id: P.c.id } }
    );
    const res = await call('POST', '/auth/reset-password', { body: { token, password: 'Fresh@5678' } });
    ok(res);
    assert.ok(res.data.token);
    assert.equal((await call('POST', '/auth/reset-password', { body: { token, password: 'Again@5678' } })).code, 'RESET_TOKEN_INVALID');
    assert.equal((await call('GET', '/auth/me', { token: P.c.token })).code, 'TOKEN_REVOKED');
    ok(await call('POST', '/auth/login', { body: { email: P.c.email, password: 'Fresh@5678' } }));
  });

  await step('changing the password keeps this device signed in and signs out the others', async () => {
    const other = (await call('POST', '/auth/login', { body: { email: P.a.email, password: 'Test@1234' } })).data.token;
    const res = await call('POST', '/auth/change-password', { token: P.a.token, body: { currentPassword: 'Test@1234', newPassword: 'Newer@1234' } });
    ok(res);
    ok(await call('GET', '/auth/me', { token: res.data.token }));
    assert.equal((await call('GET', '/auth/me', { token: other })).code, 'TOKEN_REVOKED');
    P.a.token = res.data.token;
  });

  await step('sign out everywhere revokes every token', async () => {
    ok(await call('POST', '/auth/logout-all', { token: P.a.token }));
    assert.equal((await call('GET', '/auth/me', { token: P.a.token })).code, 'TOKEN_REVOKED');
  });

  await step('cleanup: doctor photo removed', async () => {
    ok(await call('DELETE', '/doctor/profile/photo', { token: dt }));
  });

  console.log(`\n${passed} clinic checks passed.`);
}

main()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(async () => {
    // Deleting the users cascades to their profile, slots, appointments, reviews, waitlist and notifications.
    if (createdUsers.length) await User.destroy({ where: { id: createdUsers } });
    await sequelize.close();
  });
