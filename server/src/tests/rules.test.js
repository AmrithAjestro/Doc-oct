/**
 * Unit tests for the booking rules that every screen depends on. They need no database.
 *   npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateFee } = require('../utils/helpers');
const { present } = require('../services/appointment.service');
const { parsePagination, roundMoney } = require('../utils/helpers');
const { insideLateWindow } = require('../utils/helpers');

const HOUR = 3600e3;
const patient = { id: 'p1', role: 'user' };
const doctor = { id: 'd1', role: 'doctor', doctorProfile: { id: 'dp1' } };
const admin = { id: 'a1', role: 'admin' };
const appt = (hoursFromNow, status = 'confirmed', extra = {}) => ({
  id: 'x',
  userId: 'p1',
  doctorId: 'dp1',
  status,
  startAt: new Date(Date.now() + hoursFromNow * HOUR),
  endAt: new Date(Date.now() + hoursFromNow * HOUR + 0.5 * HOUR),
  doctorNotes: 'private',
  ...extra
});

test('fee: percentage commission is added to the doctor fee', () => {
  assert.deepEqual(calculateFee(800, { commissionType: 'percentage', commissionValue: 10 }), { doctorFee: 800, commission: 80, totalFee: 880 });
});

test('fee: flat commission and rounding to 2 decimals', () => {
  assert.deepEqual(calculateFee(499.995, { commissionType: 'flat', commissionValue: 25 }), { doctorFee: 500, commission: 25, totalFee: 525 });
  assert.equal(calculateFee(333, { commissionType: 'percentage', commissionValue: 12.5 }).commission, 41.63);
});

test('fee: missing settings means no commission', () => {
  assert.deepEqual(calculateFee(500, null), { doctorFee: 500, commission: 0, totalFee: 500 });
});

test('patient can confirm, move and cancel outside the 24-hour window', () => {
  const a = present(appt(48, 'pending_confirmation'), patient);
  assert.equal(a.isLocked, false);
  assert.equal(a.actions.confirm, true);
  assert.equal(a.actions.reschedule, true);
  assert.equal(a.actions.cancel, true);
});

test('patient cannot change anything inside the 24-hour window', () => {
  const a = present(appt(5), patient);
  assert.equal(a.isLocked, true);
  assert.equal(a.actions.reschedule, false);
  assert.equal(a.actions.cancel, false);
  assert.equal(a.actions.confirm, false);
});

test('confirm deadline is start minus 24 hours', () => {
  const a = appt(48, 'pending_confirmation');
  assert.equal(present(a, patient).confirmBy.getTime(), a.startAt.getTime() - 24 * HOUR);
});

test('doctor and admin can cancel until the start, even inside 24 hours', () => {
  assert.equal(present(appt(5), doctor).actions.cancel, true);
  assert.equal(present(appt(5), admin).actions.cancel, true);
  assert.equal(present(appt(-0.1), doctor).actions.cancel, false);
});

test('complete, no-show and prescription only after the start, only for the doctor', () => {
  const future = present(appt(2), doctor).actions;
  assert.equal(future.complete, false);
  assert.equal(future.prescribe, false);
  const started = present(appt(-0.1), doctor).actions;
  assert.equal(started.complete, true);
  assert.equal(started.noShow, true);
  assert.equal(started.prescribe, true);
  assert.equal(present(appt(-0.1), patient).actions.complete, false);
});

test('patients may review completed visits only', () => {
  assert.equal(present(appt(-5, 'completed'), patient).actions.review, true);
  assert.equal(present(appt(-5, 'cancelled'), patient).actions.review, false);
  assert.equal(present(appt(-5, 'completed'), doctor).actions.review, false);
});

test("the doctor's private notes are never sent to the patient", () => {
  assert.equal('doctorNotes' in present(appt(48), patient), false);
  assert.equal(present(appt(48), doctor).doctorNotes, 'private');
});

test('cancelled appointments offer no actions', () => {
  const actions = present(appt(48, 'cancelled'), patient).actions;
  assert.equal(Object.values(actions).some(Boolean), false);
});

test('pagination is clamped to sane values', () => {
  assert.deepEqual(parsePagination({ page: '-3', limit: '1000' }), { page: 1, limit: 100, offset: 0 });
  assert.deepEqual(parsePagination({ page: '3', limit: '10' }), { page: 3, limit: 10, offset: 20 });
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
});

test('a visit the doctor moved is not locked for the patient, even inside 24 hours', () => {
  const a = present(appt(3, 'confirmed', { awaitingPatientReply: true }), patient);
  assert.equal(a.isLocked, false);
  assert.equal(a.actions.confirm, true); // "Accept new time"
  assert.equal(a.actions.reschedule, true);
  assert.equal(a.actions.cancel, true);
});

test('a patient told the doctor is running late may cancel or move inside 24 hours', () => {
  const a = present(appt(1, 'confirmed', { delayNotifiedAt: new Date(), delayMinutes: 30 }), patient);
  assert.equal(a.isLocked, false);
  assert.equal(a.actions.cancel, true);
  assert.equal(a.actions.reschedule, true);
  assert.equal(a.actions.confirm, false);
});

test('running-late window: times before "until" are inside, an expired delay counts as none', () => {
  const late = { runningLateUntil: new Date(Date.now() + 2 * HOUR) };
  assert.equal(insideLateWindow(late, new Date(Date.now() + HOUR)), true);
  assert.equal(insideLateWindow(late, new Date(Date.now() + 3 * HOUR)), false);
  assert.equal(insideLateWindow({ runningLateUntil: new Date(Date.now() - HOUR) }, new Date()), false);
  assert.equal(insideLateWindow({}, new Date()), false);
});

test('a cancelled visit never offers "Accept new time"', () => {
  assert.equal(present(appt(3, 'cancelled', { awaitingPatientReply: true }), patient).actions.confirm, false);
});

test('"Can\'t attend" is for booked visits, before or after the start', () => {
  assert.equal(present(appt(2), doctor).actions.unavailable, true);
  assert.equal(present(appt(-0.2), doctor).actions.unavailable, true);
  assert.equal(present(appt(2), patient).actions.unavailable, false);
});

test('walk-ins: no "Can\'t attend" or no-show, but complete and prescribe at once', () => {
  const a = present(appt(-0.01, 'confirmed', { visitType: 'walk_in' }), doctor).actions;
  assert.equal(a.unavailable, false);
  assert.equal(a.noShow, false);
  assert.equal(a.complete, true);
  assert.equal(a.prescribe, true);
});
