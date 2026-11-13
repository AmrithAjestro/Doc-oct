const { Op } = require('sequelize');
const config = require('../config/config');
const {
  ROLES,
  DOCTOR_STATUS,
  SLOT_STATUS,
  APPOINTMENT_STATUS: S,
  ACTIVE_APPOINTMENT_STATUSES: ACTIVE
} = require('../config/constants');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { VISIT_TYPES } = require('../config/constants');
const { sequelize, Appointment, Slot, DoctorProfile, User, Prescription, Review } = require('../models');
const AppError = require('../utils/AppError');
const { HOUR, formatDateTime, parsePagination, pageMeta } = require('../utils/helpers');
const { calculateFee } = require('../utils/fees');
const { getSettings } = require('./settings.service');
const { notify } = require('./notification.service');
const reminders = require('./reminder.service');
const waitlist = require('./waitlist.service');
const { insideLateWindow } = require('../utils/runningLate');

const { LOCK_WINDOW_HOURS, AUTO_RESCHEDULE_MIN_LEAD_HOURS, MAX_AUTO_RESCHEDULES } = config.RULES;
const LOCK_MS = LOCK_WINDOW_HOURS * HOUR;

/* ------------------------------------------------------------------ helpers */

const ms = (d) => new Date(d).getTime();
const isInsideLockWindow = (startAt, now = Date.now()) => ms(startAt) - now < LOCK_MS;
// The doctor moved the visit or said they are running late: the 24-hour lock does not bind the patient.
const lockLifted = (appt) => Boolean(appt.awaitingPatientReply || appt.delayNotifiedAt);
const confirmDeadline = (startAt) => new Date(ms(startAt) - LOCK_MS);

/**
 * Serialises all booking changes for one patient (and the scheduler acting for them) so two
 * parallel requests cannot both pass the "no overlapping appointment" check.
 * Lock order everywhere: patient advisory lock → appointment row → slot rows.
 */
const lockPatient = (userId, transaction) =>
  sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `patient:${userId}` }, transaction });

const doctorInclude = { model: DoctorProfile, as: 'doctor', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }] };
const patientInclude = { model: User, as: 'patient', attributes: ['id', 'name', 'email', 'phone'] };

async function loadLocked(id, transaction) {
  const appt = await Appointment.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!appt) throw AppError.notFound('Appointment not found');
  // Associations are read separately: FOR UPDATE cannot be combined with outer joins in Postgres.
  appt.doctor = await DoctorProfile.findByPk(appt.doctorId, { include: [{ model: User, as: 'user' }], transaction });
  appt.patient = await User.findByPk(appt.userId, { transaction });
  return appt;
}

function assertParticipant(appt, actor) {
  if (actor.role === ROLES.ADMIN) return;
  if (actor.role === ROLES.USER && appt.userId === actor.id) return;
  if (actor.role === ROLES.DOCTOR && appt.doctorId === actor.doctorProfile?.id) return;
  throw AppError.notFound('Appointment not found'); // do not reveal that it exists
}

function assertPatientCanChange(appt, now = Date.now()) {
  if (!ACTIVE.includes(appt.status)) {
    throw AppError.conflict(`This appointment is already ${appt.status.replace('_', ' ')}`, 'INVALID_STATUS');
  }
  if (!lockLifted(appt) && isInsideLockWindow(appt.startAt, now)) {
    throw AppError.rule(
      `Appointments cannot be cancelled or rescheduled within ${LOCK_WINDOW_HOURS} hours of the start time`,
      'LOCK_WINDOW'
    );
  }
}

async function findUserClash(userId, startAt, endAt, transaction, excludeId) {
  const where = { userId, status: { [Op.in]: ACTIVE }, startAt: { [Op.lt]: endAt }, endAt: { [Op.gt]: startAt } };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return Appointment.findOne({ where, transaction });
}

/** Earliest free slot of the doctor after `after` (and not before `notBefore`) that the patient is free for. */
async function findNextSlot({ doctorId, after, notBefore, userId, excludeAppointmentId, transaction }) {
  const candidates = await Slot.findAll({
    where: {
      doctorId,
      status: SLOT_STATUS.AVAILABLE,
      startAt: { [Op.gt]: new Date(Math.max(ms(after), notBefore ? ms(notBefore) - 1 : 0)) }
    },
    order: [['startAt', 'ASC']],
    limit: 25,
    transaction
  });
  for (const slot of candidates) {
    const clash = await findUserClash(userId, slot.startAt, slot.endAt, transaction, excludeAppointmentId);
    if (!clash) return slot;
  }
  return null;
}

const isUniqueSlotViolation = (err) => err?.name === 'SequelizeUniqueConstraintError';
const slotTakenError = () =>
  AppError.conflict('This slot has just been booked by someone else. Please pick another one.', 'SLOT_UNAVAILABLE');

/** Adds the time rules and what the current viewer may do, so the UI never re-implements them. */
function present(appt, actor, now = Date.now()) {
  const json = typeof appt.toJSON === 'function' ? appt.toJSON() : appt;
  const start = ms(appt.startAt);
  const active = ACTIVE.includes(appt.status);
  // A visit the doctor moved is not locked for the patient until they have answered.
  const locked = start - now < LOCK_MS && !lockLifted(appt);
  const isPatient = actor.role === ROLES.USER;
  const isDoctor = actor.role === ROLES.DOCTOR;
  const started = start <= now;
  if (isPatient) delete json.doctorNotes; // the doctor's private notes
  json.confirmBy = confirmDeadline(appt.startAt);
  json.isLocked = locked;
  json.actions = {
    confirm: isPatient && ((appt.status === S.PENDING_CONFIRMATION && !locked) || Boolean(appt.awaitingPatientReply && active)),
    reschedule: isPatient && active && !locked,
    cancel: (isPatient && active && !locked) || (isDoctor && active && !started) || (actor.role === ROLES.ADMIN && active && !started),
    unavailable: isDoctor && active && appt.visitType !== 'walk_in',
    complete: isDoctor && appt.status === S.CONFIRMED && started,
    noShow: isDoctor && appt.status === S.CONFIRMED && started && appt.visitType !== 'walk_in',
    prescribe: isDoctor && [S.CONFIRMED, S.COMPLETED].includes(appt.status) && started,
    review: isPatient && appt.status === S.COMPLETED
  };
  return json;
}

const drName = (doctor) => `Dr. ${doctor?.user?.name || ''}`.trim();

/* ------------------------------------------------------------------ booking */

async function book(actor, { slotId, reason }) {
  try {
    return await sequelize.transaction(async (t) => {
      const now = Date.now();
      await lockPatient(actor.id, t);

      const slot = await Slot.findByPk(slotId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!slot) throw AppError.notFound('Slot not found');
      if (slot.status !== SLOT_STATUS.AVAILABLE) throw slotTakenError();
      if (ms(slot.startAt) <= now) throw AppError.rule('This slot has already started', 'SLOT_IN_PAST');

      const doctor = await DoctorProfile.findByPk(slot.doctorId, { include: [{ model: User, as: 'user' }], transaction: t });
      if (!doctor || doctor.status !== DOCTOR_STATUS.APPROVED || !doctor.user?.isActive) {
        throw AppError.conflict('This doctor is not accepting appointments right now', 'DOCTOR_UNAVAILABLE');
      }

      if (await findUserClash(actor.id, slot.startAt, slot.endAt, t)) {
        throw AppError.conflict('You already have another appointment at this time', 'PATIENT_OVERLAP');
      }

      const fees = calculateFee(doctor.fee, await getSettings(t));
      // A booking made inside the lock window is confirmed by the act of booking.
      const autoConfirmed = isInsideLockWindow(slot.startAt, now);

      const appt = await Appointment.create(
        {
          userId: actor.id,
          doctorId: doctor.id,
          slotId: slot.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
          reason: reason || null,
          status: autoConfirmed ? S.CONFIRMED : S.PENDING_CONFIRMATION,
          confirmedAt: autoConfirmed ? new Date(now) : null,
          ...fees
        },
        { transaction: t }
      );
      await slot.update({ status: SLOT_STATUS.BOOKED }, { transaction: t });
      await reminders.scheduleFor(appt, t);
      await waitlist.removeOnBooking(actor.id, doctor.id, t);

      const when = formatDateTime(appt.startAt);
      await notify(
        actor.id,
        {
          type: 'booking_created',
          title: autoConfirmed ? 'Appointment confirmed' : 'Appointment booked',
          message: autoConfirmed
            ? `Your appointment with ${drName(doctor)} on ${when} is confirmed. Amount payable: ${fees.totalFee}.`
            : `Your appointment with ${drName(doctor)} on ${when} is booked. Please confirm your attendance before ${formatDateTime(
                confirmDeadline(appt.startAt)
              )}, otherwise it will be moved to the next available slot.`,
          appointmentId: appt.id
        },
        t
      );
      await notify(
        doctor.userId,
        { type: 'booking_created', title: 'New appointment', message: `${actor.name} booked an appointment on ${when}.`, appointmentId: appt.id },
        t
      );
      return appt;
    });
  } catch (err) {
    // Two requests that slipped past the row lock still meet the partial unique index.
    if (isUniqueSlotViolation(err)) throw slotTakenError();
    throw err;
  }
}

/* ------------------------------------------------------------- confirmation */

async function confirmAttendance(actor, id) {
  return sequelize.transaction(async (t) => {
    await lockPatient(actor.id, t);
    const appt = await loadLocked(id, t);
    if (appt.userId !== actor.id) throw AppError.notFound('Appointment not found');
    if (appt.awaitingPatientReply) {
      // Accepting the time the doctor offered after they could not attend.
      await appt.update({ awaitingPatientReply: false, status: S.CONFIRMED, confirmedAt: new Date() }, { transaction: t });
      await notify(
        appt.doctor.userId,
        { type: 'booking_confirmed', title: 'New time accepted', message: `${appt.patient.name} accepted the new time ${formatDateTime(appt.startAt)}.`, appointmentId: appt.id },
        t
      );
      return appt;
    }
    if (appt.status === S.CONFIRMED) return appt; // idempotent
    if (appt.status !== S.PENDING_CONFIRMATION) throw AppError.conflict(`This appointment is ${appt.status.replace('_', ' ')}`, 'INVALID_STATUS');
    if (isInsideLockWindow(appt.startAt)) {
      throw AppError.rule('The confirmation deadline has passed; this appointment is being moved to the next available slot.', 'CONFIRMATION_CLOSED');
    }
    await appt.update({ status: S.CONFIRMED, confirmedAt: new Date() }, { transaction: t });
    await reminders.cancelPending(appt.id, t, ['confirm']);
    await notify(
      appt.doctor.userId,
      { type: 'booking_confirmed', title: 'Appointment confirmed', message: `${appt.patient.name} confirmed the appointment on ${formatDateTime(appt.startAt)}.`, appointmentId: appt.id },
      t
    );
    return appt;
  });
}

/* --------------------------------------------------------------- reschedule */

/** Moves an appointment to another slot. Caller holds the locks and has validated the slot. */
async function moveToSlot(appt, newSlot, t, { by }) {
  const previousStartAt = appt.startAt;
  if (appt.slotId) {
    const oldSlot = await Slot.findByPk(appt.slotId, { transaction: t, lock: t.LOCK.UPDATE });
    // The doctor was not available at the old time, so that slot is blocked rather than reopened.
    if (oldSlot) {
      // Not reopened if the doctor was unavailable then, or is running late at that time.
      const keepClosed = by === 'doctor' || insideLateWindow(appt.doctor, oldSlot.startAt);
      await oldSlot.update({ status: keepClosed ? SLOT_STATUS.BLOCKED : SLOT_STATUS.AVAILABLE }, { transaction: t });
      if (!keepClosed) t.afterCommit(() => waitlist.announce(oldSlot.doctorId, [oldSlot]));
    }
  }
  await newSlot.update({ status: SLOT_STATUS.BOOKED }, { transaction: t });

  const bySystem = by === 'system';
  const byDoctor = by === 'doctor';
  await appt.update(
    {
      slotId: newSlot.id,
      startAt: newSlot.startAt,
      endAt: newSlot.endAt,
      previousStartAt,
      rescheduleCount: appt.rescheduleCount + 1,
      autoRescheduleCount: appt.autoRescheduleCount + (bySystem ? 1 : 0),
      // The patient picked the new time themselves, so it counts as confirmed; a system move needs confirming.
      // A doctor's move stands unless the patient changes it (they are asked to accept).
      status: bySystem ? S.PENDING_CONFIRMATION : S.CONFIRMED,
      confirmedAt: bySystem ? null : byDoctor ? appt.confirmedAt : new Date(),
      awaitingPatientReply: byDoctor,
      delayNotifiedAt: null,
      delayMinutes: null,
      ...(byDoctor ? {} : { doctorMoveReason: null })
    },
    { transaction: t }
  );
  await reminders.resetFor(appt, t);
  return previousStartAt;
}

async function previewReschedule(actor, id) {
  const appt = await Appointment.findByPk(id, { include: [doctorInclude] });
  if (!appt || appt.userId !== actor.id) throw AppError.notFound('Appointment not found');
  assertPatientCanChange(appt);
  const after = lockLifted(appt) ? new Date() : appt.startAt;
  const candidates = await Slot.findAll({
    where: { doctorId: appt.doctorId, status: SLOT_STATUS.AVAILABLE, startAt: { [Op.gt]: new Date(Math.max(ms(after), Date.now())) } },
    order: [['startAt', 'ASC']],
    limit: 60
  });
  const options = [];
  for (const s of candidates) {
    if (options.length >= 20) break;
    if (s.id === appt.slotId) continue;
    if (!(await findUserClash(actor.id, s.startAt, s.endAt, undefined, appt.id))) options.push({ id: s.id, startAt: s.startAt, endAt: s.endAt });
  }
  if (!options.length) {
    throw AppError.notFound('No later slot is available with this doctor right now. You can cancel the appointment instead.', 'NO_SLOT_AVAILABLE');
  }
  return { appointment: present(appt, actor), nextSlot: options[0], options };
}

async function reschedule(actor, id, { slotId }) {
  try {
    return await sequelize.transaction(async (t) => {
      await lockPatient(actor.id, t);
      const appt = await loadLocked(id, t);
      if (appt.userId !== actor.id) throw AppError.notFound('Appointment not found');
      assertPatientCanChange(appt);

      const slot = await Slot.findByPk(slotId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!slot || slot.doctorId !== appt.doctorId) throw AppError.badRequest('Choose a slot with the same doctor', 'INVALID_SLOT');
      if (slot.id === appt.slotId) throw AppError.badRequest('That is the current slot', 'SAME_SLOT');
      if (slot.status !== SLOT_STATUS.AVAILABLE) throw AppError.conflict('That slot was just taken. Please look for the next one again.', 'SLOT_UNAVAILABLE');
      if (!lockLifted(appt) && isInsideLockWindow(slot.startAt)) throw AppError.rule(`The new slot must be more than ${LOCK_WINDOW_HOURS} hours away`, 'LOCK_WINDOW');
      if (ms(slot.startAt) <= Date.now()) throw AppError.rule('That time has already passed', 'SLOT_IN_PAST');
      if (await findUserClash(actor.id, slot.startAt, slot.endAt, t, appt.id)) {
        throw AppError.conflict('You already have another appointment at that time', 'PATIENT_OVERLAP');
      }

      const previous = await moveToSlot(appt, slot, t, { by: 'user' });
      const msg = `${formatDateTime(previous)} → ${formatDateTime(slot.startAt)}`;
      await notify(actor.id, { type: 'booking_rescheduled', title: 'Appointment rescheduled', message: `Your appointment with ${drName(appt.doctor)} was moved: ${msg}.`, appointmentId: appt.id }, t);
      await notify(appt.doctor.userId, { type: 'booking_rescheduled', title: 'Appointment rescheduled', message: `${appt.patient.name} rescheduled: ${msg}.`, appointmentId: appt.id }, t);
      return appt;
    });
  } catch (err) {
    if (isUniqueSlotViolation(err)) throw slotTakenError();
    throw err;
  }
}

/* ------------------------------------------------------------------- cancel */

/** Cancels inside an existing transaction. Used by the API, the scheduler and admin cascades. */
async function cancelInTransaction(appt, { by, reason }, t) {
  const now = Date.now();
  await appt.update({ status: S.CANCELLED, cancelledAt: new Date(now), cancelledBy: by, cancelReason: reason || null, awaitingPatientReply: false }, { transaction: t });

  if (appt.slotId && ms(appt.startAt) > now) {
    const slot = await Slot.findByPk(appt.slotId, { transaction: t, lock: t.LOCK.UPDATE });
    // A doctor who cancels is not available then, so the slot is blocked instead of reopened.
    // A doctor who cancels is unavailable then; a doctor running late cannot take a new patient then either.
    const keepClosed = by === ROLES.DOCTOR || insideLateWindow(appt.doctor, appt.startAt);
    if (slot) await slot.update({ status: keepClosed ? SLOT_STATUS.BLOCKED : SLOT_STATUS.AVAILABLE }, { transaction: t });
    if (slot && !keepClosed) t.afterCommit(() => waitlist.announce(slot.doctorId, [slot]));
  }
  await reminders.cancelPending(appt.id, t);

  const when = formatDateTime(appt.startAt);
  const suffix = reason ? ` Reason: ${reason}` : '';
  const doctorUserId = appt.doctor?.userId;
  if (by !== ROLES.USER) {
    await notify(appt.userId, { type: 'booking_cancelled', title: 'Appointment cancelled', message: `Your appointment with ${drName(appt.doctor)} on ${when} was cancelled.${suffix}`, appointmentId: appt.id }, t);
  }
  if (by !== ROLES.DOCTOR && doctorUserId) {
    await notify(doctorUserId, { type: 'booking_cancelled', title: 'Appointment cancelled', message: `The appointment with ${appt.patient?.name || 'a patient'} on ${when} was cancelled.${suffix}`, appointmentId: appt.id }, t);
  }
  if (by === ROLES.USER) {
    await notify(appt.userId, { type: 'booking_cancelled', title: 'Appointment cancelled', message: `You cancelled your appointment with ${drName(appt.doctor)} on ${when}.`, appointmentId: appt.id }, t);
  }
}

async function cancel(actor, id, { reason }) {
  return sequelize.transaction(async (t) => {
    if (actor.role === ROLES.USER) await lockPatient(actor.id, t);
    const appt = await loadLocked(id, t);
    assertParticipant(appt, actor);

    if (actor.role === ROLES.USER) {
      assertPatientCanChange(appt);
    } else {
      if (!ACTIVE.includes(appt.status)) throw AppError.conflict(`This appointment is already ${appt.status.replace('_', ' ')}`, 'INVALID_STATUS');
      if (ms(appt.startAt) <= Date.now()) {
        throw AppError.rule('The appointment has already started. Mark it completed or no-show instead.', 'ALREADY_STARTED');
      }
      if (!reason) throw AppError.badRequest('Please give a reason for the patient', 'REASON_REQUIRED');
    }
    await cancelInTransaction(appt, { by: actor.role, reason }, t);
    return appt;
  });
}

/* ---------------------------------------------------- doctor: after the visit */

async function loadForDoctor(actor, id, t) {
  const appt = await loadLocked(id, t);
  if (appt.doctorId !== actor.doctorProfile?.id) throw AppError.notFound('Appointment not found');
  return appt;
}

async function complete(actor, id, { notes }) {
  return sequelize.transaction(async (t) => {
    const appt = await loadForDoctor(actor, id, t);
    if (appt.status !== S.CONFIRMED) throw AppError.conflict('Only a confirmed appointment can be completed', 'INVALID_STATUS');
    if (ms(appt.startAt) > Date.now()) throw AppError.rule('The appointment has not started yet', 'NOT_STARTED');
    await appt.update({ status: S.COMPLETED, completedAt: new Date(), doctorNotes: notes ?? appt.doctorNotes }, { transaction: t });
    await reminders.cancelPending(appt.id, t);
    const hasRx = await Prescription.count({ where: { appointmentId: appt.id }, transaction: t });
    await notify(
      appt.userId,
      {
        type: 'booking_completed',
        title: 'Appointment completed',
        message: `Your appointment with ${drName(appt.doctor)} is complete.${hasRx ? ' Your prescription is available in the app.' : ''} Thank you!`,
        appointmentId: appt.id
      },
      t
    );
    return appt;
  });
}

async function markNoShow(actor, id) {
  return sequelize.transaction(async (t) => {
    const appt = await loadForDoctor(actor, id, t);
    if (appt.status !== S.CONFIRMED) throw AppError.conflict('Only a confirmed appointment can be marked as no-show', 'INVALID_STATUS');
    if (ms(appt.startAt) > Date.now()) throw AppError.rule('The appointment has not started yet', 'NOT_STARTED');
    await appt.update({ status: S.NO_SHOW }, { transaction: t });
    await reminders.cancelPending(appt.id, t);
    await notify(appt.userId, { type: 'booking_no_show', title: 'Missed appointment', message: `You were marked as not attending your appointment with ${drName(appt.doctor)} on ${formatDateTime(appt.startAt)}.`, appointmentId: appt.id }, t);
    return appt;
  });
}

async function savePrescription(actor, id, data) {
  return sequelize.transaction(async (t) => {
    const appt = await loadForDoctor(actor, id, t);
    if (![S.CONFIRMED, S.COMPLETED].includes(appt.status)) throw AppError.conflict('A prescription can only be added to an attended appointment', 'INVALID_STATUS');
    if (ms(appt.startAt) > Date.now()) throw AppError.rule('A prescription can be added once the appointment has started', 'NOT_STARTED');

    const existing = await Prescription.findOne({ where: { appointmentId: appt.id }, transaction: t });
    const oldFollowUp = existing?.followUpDate || null;
    const prescription = existing
      ? await existing.update(data, { transaction: t })
      : await Prescription.create({ ...data, appointmentId: appt.id }, { transaction: t });

    await notify(
      appt.userId,
      {
        type: existing ? 'prescription_updated' : 'prescription_added',
        title: existing ? 'Prescription updated' : 'Prescription available',
        message: `${drName(appt.doctor)} ${existing ? 'updated' : 'added'} a prescription for your appointment on ${formatDateTime(appt.startAt)}.`,
        appointmentId: appt.id
      },
      t
    );

    // A newly set or changed follow-up date gets its own notice (in-app + e-mail), so the patient knows to come back
    const newFollowUp = prescription.followUpDate || null;
    if (newFollowUp && newFollowUp !== oldFollowUp) {
      const when = new Date(`${newFollowUp}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      await notify(
        appt.userId,
        {
          type: 'follow_up_scheduled',
          title: oldFollowUp ? 'Follow-up visit rescheduled' : 'Follow-up visit scheduled',
          message: `${drName(appt.doctor)} wants to see you again on ${when}. Please book a slot for that day.`,
          appointmentId: appt.id
        },
        t
      );
    }
    return prescription;
  });
}

/** The patient rates a completed visit (1-5 stars, optional comment). Saving again edits the review. */
async function saveReview(actor, id, { rating, comment }) {
  const appt = await Appointment.findByPk(id, { include: [doctorInclude] });
  if (!appt || appt.userId !== actor.id) throw AppError.notFound('Appointment not found');
  if (appt.status !== S.COMPLETED) throw AppError.rule('You can review a visit once it is completed', 'NOT_COMPLETED');
  const existing = await Review.findOne({ where: { appointmentId: appt.id } });
  if (existing) return existing.update({ rating, comment: comment ?? null });
  const review = await Review.create({ appointmentId: appt.id, doctorId: appt.doctorId, userId: actor.id, rating, comment: comment ?? null });
  await notify(appt.doctor.userId, {
    type: 'review_added',
    title: 'New patient review',
    message: `${actor.name.split(' ')[0]} rated the visit on ${formatDateTime(appt.startAt)} ${rating} out of 5.`,
    appointmentId: appt.id
  });
  return review;
}

/* -------------------------------------------------------------------- reads */

function scopeWhere(actor) {
  if (actor.role === ROLES.USER) return { userId: actor.id };
  if (actor.role === ROLES.DOCTOR) return { doctorId: actor.doctorProfile?.id ?? null };
  return {};
}

async function list(actor, query) {
  const paging = parsePagination(query);
  const now = new Date();
  const where = scopeWhere(actor);
  if (query.status) where.status = query.status;
  if (query.scope === 'upcoming') {
    where.endAt = { [Op.gte]: now };
    if (!query.status) where.status = { [Op.in]: ACTIVE };
  } else if (query.scope === 'past') {
    where[Op.or] = [{ endAt: { [Op.lt]: now } }, { status: { [Op.notIn]: ACTIVE } }];
  }
  if (query.from || query.to) {
    where.startAt = { ...(query.from && { [Op.gte]: query.from }), ...(query.to && { [Op.lt]: query.to }) };
  }
  if (query.doctorId && actor.role === ROLES.ADMIN) where.doctorId = query.doctorId;
  if (query.search) {
    const term = `%${query.search}%`;
    where[Op.and] = [{ [Op.or]: [{ '$patient.name$': { [Op.iLike]: term } }, { '$doctor.user.name$': { [Op.iLike]: term } }] }];
  }

  const { rows, count } = await Appointment.findAndCountAll({
    where,
    include: [patientInclude, doctorInclude, { model: Prescription, as: 'prescription', attributes: ['id'] }],
    order: [['startAt', query.scope === 'upcoming' ? 'ASC' : 'DESC']],
    limit: paging.limit,
    offset: paging.offset,
    distinct: true
  });
  return { rows: rows.map((a) => present(a, actor)), meta: pageMeta(paging, count) };
}

async function getById(actor, id) {
  const appt = await Appointment.findByPk(id, {
    include: [patientInclude, doctorInclude, { model: Prescription, as: 'prescription' }, { model: Review, as: 'review', attributes: ['id', 'rating', 'comment', 'createdAt'] }]
  });
  if (!appt) throw AppError.notFound('Appointment not found');
  assertParticipant(appt, actor);
  return present(appt, actor);
}

/* --------------------------------------------------- doctor cannot attend */

/** The doctor's next free times this patient could take (for the "Can't attend" picker). */
async function unavailableOptions(actor, id) {
  const appt = await Appointment.findByPk(id);
  if (!appt || appt.doctorId !== actor.doctorProfile?.id) throw AppError.notFound('Appointment not found');
  const candidates = await Slot.findAll({
    where: { doctorId: appt.doctorId, status: SLOT_STATUS.AVAILABLE, startAt: { [Op.gt]: new Date() } },
    order: [['startAt', 'ASC']],
    limit: 30
  });
  const out = [];
  for (const s of candidates) {
    if (out.length >= 8) break;
    if (!(await findUserClash(appt.userId, s.startAt, s.endAt, undefined, appt.id))) out.push({ id: s.id, startAt: s.startAt, endAt: s.endAt });
  }
  return out;
}

/**
 * The doctor cannot see the patient (a critical emergency, for example) — before or after the start.
 * The visit moves to the slot the doctor picked, or to their next free slot (the patient gets first
 * pick of it), at the same price. With no free slot left it is cancelled as "doctor unavailable",
 * never as a no-show. The patient may then accept, choose another time or cancel without the 24-hour lock.
 */
async function doctorUnavailable(actor, id, { reason, slotId }) {
  try {
    return await sequelize.transaction(async (t) => {
      const appt = await Appointment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!appt || appt.doctorId !== actor.doctorProfile?.id) throw AppError.notFound('Appointment not found');
      await lockPatient(appt.userId, t);
      if (!ACTIVE.includes(appt.status)) throw AppError.conflict(`This appointment is already ${appt.status.replace('_', ' ')}`, 'INVALID_STATUS');
      appt.doctor = await DoctorProfile.findByPk(appt.doctorId, { include: [{ model: User, as: 'user' }], transaction: t });
      appt.patient = await User.findByPk(appt.userId, { transaction: t });

      let slot = null;
      if (slotId) {
        slot = await Slot.findByPk(slotId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!slot || slot.doctorId !== appt.doctorId) throw AppError.badRequest('Choose one of your own free slots', 'INVALID_SLOT');
        if (slot.status !== SLOT_STATUS.AVAILABLE || ms(slot.startAt) <= Date.now()) throw AppError.conflict('That slot is no longer free. Pick another one.', 'SLOT_UNAVAILABLE');
        if (await findUserClash(appt.userId, slot.startAt, slot.endAt, t, appt.id)) throw AppError.conflict('The patient has another appointment at that time', 'PATIENT_OVERLAP');
      } else {
        const next = await findNextSlot({ doctorId: appt.doctorId, after: new Date(), userId: appt.userId, excludeAppointmentId: appt.id, transaction: t });
        slot = next && (await Slot.findByPk(next.id, { transaction: t, lock: t.LOCK.UPDATE }));
        if (slot && slot.status !== SLOT_STATUS.AVAILABLE) slot = null;
      }

      if (!slot) {
        await cancelInTransaction(appt, { by: ROLES.DOCTOR, reason: `Doctor unavailable: ${reason}. No other free time was available.` }, t);
        return { outcome: 'cancelled' };
      }

      const previous = await moveToSlot(appt, slot, t, { by: 'doctor' });
      await appt.update({ doctorMoveReason: reason }, { transaction: t });
      await notify(
        appt.userId,
        {
          type: 'doctor_moved',
          title: 'Your doctor had to move your visit',
          message: `${drName(appt.doctor)} could not see you at ${formatDateTime(previous)} (${reason}). Your visit is now at ${formatDateTime(
            slot.startAt
          )}, same price. Open the appointment to accept it, choose another time or cancel.`,
          appointmentId: appt.id
        },
        t
      );
      return { outcome: 'moved', startAt: slot.startAt };
    });
  } catch (err) {
    if (isUniqueSlotViolation(err)) throw slotTakenError();
    throw err;
  }
}

/* ---------------------------------------------------------------- walk-ins */

const normalisePhone = (p) => p.replace(/[\s-]/g, '');

/**
 * Finds the patient by e-mail, then by phone, or creates an account for them. A created account
 * gets an unusable random password; with a real e-mail the patient claims it via "Forgot password".
 */
async function findOrCreateWalkInPatient({ name, phone, email }, t) {
  let patient = email ? await User.findOne({ where: { email }, transaction: t }) : null;
  if (!patient) {
    // Compare phone numbers without spaces or dashes ("+91 98765 43210" = "+919876543210").
    patient = await User.findOne({
      where: sequelize.where(sequelize.fn('regexp_replace', sequelize.col('phone'), '[[:space:]-]', '', 'g'), normalisePhone(phone)),
      transaction: t
    });
  }
  if (patient) {
    if (patient.role !== ROLES.USER) throw AppError.conflict('This e-mail or phone belongs to a staff account, not a patient', 'NOT_A_PATIENT');
    if (!patient.isActive) throw AppError.conflict('This patient account is deactivated. Ask the admin to reactivate it.', 'ACCOUNT_INACTIVE');
    return { patient, created: false };
  }
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  patient = await User.create(
    { name, phone, email: email || `walkin-${crypto.randomUUID()}@patients.invalid`, passwordHash, role: ROLES.USER },
    { transaction: t }
  );
  return { patient, created: true };
}

/**
 * A patient seen without a booking. The visit starts now (so it can be completed and prescribed
 * at once), has no slot, and costs the doctor's fee only. Booked appointments that overlap are
 * returned so the doctor can tell those patients about a delay.
 */
async function recordWalkIn(actor, { name, phone, email, reason, isEmergency, fee, durationMinutes }) {
  const profile = actor.doctorProfile;
  const start = new Date();
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const doctorFee = Math.round(Number(fee ?? profile.fee) * 100) / 100;

  const { appt, created } = await sequelize.transaction(async (t) => {
    const { patient, created: isNew } = await findOrCreateWalkInPatient({ name, phone, email }, t);
    const a = await Appointment.create(
      {
        userId: patient.id,
        doctorId: profile.id,
        slotId: null,
        startAt: start,
        endAt: end,
        status: S.CONFIRMED,
        confirmedAt: start,
        reason: reason || null,
        visitType: VISIT_TYPES.WALK_IN,
        isEmergency,
        doctorFee,
        commission: 0,
        totalFee: doctorFee
      },
      { transaction: t }
    );
    if (!isNew) {
      await notify(
        patient.id,
        { type: 'walk_in_recorded', title: 'Clinic visit recorded', message: `Your visit with Dr. ${actor.name} on ${formatDateTime(start)} has been recorded.`, appointmentId: a.id },
        t
      );
    }
    return { appt: a, created: isNew };
  });

  // Booked patients whose time overlaps the walk-in, or starts within the next hour after it.
  const affected = await Appointment.findAll({
    where: {
      doctorId: profile.id,
      visitType: VISIT_TYPES.BOOKED,
      status: { [Op.in]: ACTIVE },
      startAt: { [Op.lt]: new Date(end.getTime() + HOUR), [Op.gte]: new Date(start.getTime() - 30 * 60000) },
      endAt: { [Op.gt]: start }
    },
    include: [{ model: User, as: 'patient', attributes: ['id', 'name'] }],
    order: [['startAt', 'ASC']]
  });
  return {
    appointmentId: appt.id,
    patientCreated: created,
    affected: affected.map((a) => ({ id: a.id, startAt: a.startAt, patientName: a.patient?.name }))
  };
}

/** Tells booked patients the doctor is running late because of a walk-in / emergency. */
async function notifyDelay(actor, { appointmentIds, minutes }) {
  const appts = await Appointment.findAll({
    where: { id: appointmentIds, doctorId: actor.doctorProfile.id, status: { [Op.in]: ACTIVE } }
  });
  if (appts.length) {
    // Behind schedule until the last delayed visit's end plus the delay (never shortens an existing window).
    const lastEnd = Math.max(...appts.map((a) => ms(a.endAt)));
    const until = new Date(lastEnd + minutes * 60000);
    const current = actor.doctorProfile.runningLateUntil ? ms(actor.doctorProfile.runningLateUntil) : 0;
    await actor.doctorProfile.update({ runningLateMinutes: minutes, runningLateUntil: new Date(Math.max(until.getTime(), current)) });
  }
  for (const a of appts) {
    await a.update({ delayNotifiedAt: new Date(), delayMinutes: minutes });
    await notify(a.userId, {
      type: 'doctor_delayed',
      title: 'Your doctor is running late',
      message: `Dr. ${actor.name} is attending an emergency. Your appointment at ${formatDateTime(a.startAt)} may start about ${minutes} minutes late. Your booking is kept; if the delay does not suit you, you can move or cancel it in the app.`,
      appointmentId: a.id
    });
  }
  return { notified: appts.length };
}

/** The doctor is back on schedule. Slots blocked during the delay stay blocked until reopened in Availability. */
async function caughtUp(actor) {
  await actor.doctorProfile.update({ runningLateMinutes: null, runningLateUntil: null });
  return actor.doctorProfile;
}

/* ---------------------------------------------------------------- scheduler */

/**
 * Appointments still unconfirmed when the lock window opens are moved to the doctor's next free
 * slot (at least AUTO_RESCHEDULE_MIN_LEAD_HOURS ahead, so the patient has a full day to confirm the
 * new time). With no slot left, or after MAX_AUTO_RESCHEDULES moves, the appointment is cancelled
 * and the slot released for other patients.
 */
async function processUnconfirmed() {
  const due = await Appointment.findAll({
    where: { status: S.PENDING_CONFIRMATION, startAt: { [Op.lte]: new Date(Date.now() + LOCK_MS) } },
    attributes: ['id', 'userId'],
    order: [['startAt', 'ASC']],
    limit: 50
  });

  let handled = 0;
  for (const { id, userId } of due) {
    try {
      await sequelize.transaction(async (t) => {
        await lockPatient(userId, t);
        const appt = await Appointment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE, skipLocked: true });
        if (!appt || appt.status !== S.PENDING_CONFIRMATION || !isInsideLockWindow(appt.startAt)) return;
        appt.doctor = await DoctorProfile.findByPk(appt.doctorId, { include: [{ model: User, as: 'user' }], transaction: t });
        appt.patient = await User.findByPk(appt.userId, { transaction: t });

        const exhausted = appt.autoRescheduleCount >= MAX_AUTO_RESCHEDULES;
        const candidate = exhausted
          ? null
          : await findNextSlot({
              doctorId: appt.doctorId,
              after: appt.startAt,
              notBefore: new Date(Date.now() + AUTO_RESCHEDULE_MIN_LEAD_HOURS * HOUR),
              userId: appt.userId,
              excludeAppointmentId: appt.id,
              transaction: t
            });
        const slot = candidate && (await Slot.findByPk(candidate.id, { transaction: t, lock: t.LOCK.UPDATE }));

        if (slot && slot.status === SLOT_STATUS.AVAILABLE) {
          const previous = await moveToSlot(appt, slot, t, { by: 'system' });
          await notify(
            appt.userId,
            {
              type: 'booking_auto_rescheduled',
              title: 'Appointment moved',
              message: `Your appointment on ${formatDateTime(previous)} was not confirmed in time, so it has been moved to the next available slot: ${formatDateTime(
                slot.startAt
              )}. Please confirm before ${formatDateTime(confirmDeadline(slot.startAt))}.`,
              appointmentId: appt.id
            },
            t
          );
          await notify(
            appt.doctor.userId,
            { type: 'booking_auto_rescheduled', title: 'Appointment moved', message: `${appt.patient.name}'s unconfirmed appointment moved: ${formatDateTime(previous)} → ${formatDateTime(slot.startAt)}.`, appointmentId: appt.id },
            t
          );
        } else if (!candidate || exhausted) {
          await cancelInTransaction(
            appt,
            { by: 'system', reason: exhausted ? 'Not confirmed after automatic rescheduling' : 'Not confirmed in time and no later slot was available' },
            t
          );
        }
        // else: the candidate slot was taken a moment ago; the next run tries again.
        handled += 1;
      });
    } catch (err) {
      console.error(`[scheduler] could not process unconfirmed appointment ${id}:`, err.message);
    }
  }
  return handled;
}

/** Used when a doctor is deactivated / rejected or a patient is deactivated. */
async function cancelFutureFor(where, { by, reason }) {
  const appts = await Appointment.findAll({ where: { ...where, status: { [Op.in]: ACTIVE }, startAt: { [Op.gt]: new Date() } }, attributes: ['id'] });
  for (const { id } of appts) {
    await sequelize.transaction(async (t) => {
      const appt = await loadLocked(id, t);
      if (ACTIVE.includes(appt.status)) await cancelInTransaction(appt, { by, reason }, t);
    });
  }
  return appts.length;
}

module.exports = {
  book,
  confirmAttendance,
  previewReschedule,
  reschedule,
  cancel,
  complete,
  markNoShow,
  savePrescription,
  saveReview,
  recordWalkIn,
  doctorUnavailable,
  unavailableOptions,
  notifyDelay,
  caughtUp,
  list,
  getById,
  processUnconfirmed,
  cancelFutureFor,
  present
};
