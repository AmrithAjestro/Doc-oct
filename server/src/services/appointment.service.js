const { Op } = require('sequelize');
const config = require('../config/config');
const {
  ROLES,
  DOCTOR_STATUS,
  SLOT_STATUS,
  APPOINTMENT_STATUS: S,
  ACTIVE_APPOINTMENT_STATUSES: ACTIVE
} = require('../config/constants');
const { sequelize, Appointment, Slot, DoctorProfile, User, Prescription } = require('../models');
const AppError = require('../utils/AppError');
const { HOUR, formatDateTime, parsePagination, pageMeta } = require('../utils/helpers');
const { calculateFee } = require('../utils/fees');
const { getSettings } = require('./settings.service');
const { notify } = require('./notification.service');
const reminders = require('./reminder.service');

const { LOCK_WINDOW_HOURS, AUTO_RESCHEDULE_MIN_LEAD_HOURS, MAX_AUTO_RESCHEDULES } = config.RULES;
const LOCK_MS = LOCK_WINDOW_HOURS * HOUR;

/* ------------------------------------------------------------------ helpers */

const ms = (d) => new Date(d).getTime();
const isInsideLockWindow = (startAt, now = Date.now()) => ms(startAt) - now < LOCK_MS;
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
  if (isInsideLockWindow(appt.startAt, now)) {
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
  const locked = start - now < LOCK_MS;
  const isPatient = actor.role === ROLES.USER;
  const isDoctor = actor.role === ROLES.DOCTOR;
  const started = start <= now;
  if (isPatient) delete json.doctorNotes; // the doctor's private notes
  json.confirmBy = confirmDeadline(appt.startAt);
  json.isLocked = locked;
  json.actions = {
    confirm: isPatient && appt.status === S.PENDING_CONFIRMATION && !locked,
    reschedule: isPatient && active && !locked,
    cancel: (isPatient && active && !locked) || (isDoctor && active && !started) || (actor.role === ROLES.ADMIN && active && !started),
    complete: isDoctor && appt.status === S.CONFIRMED && started,
    noShow: isDoctor && appt.status === S.CONFIRMED && started,
    prescribe: isDoctor && [S.CONFIRMED, S.COMPLETED].includes(appt.status) && started
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
    if (oldSlot) await oldSlot.update({ status: SLOT_STATUS.AVAILABLE }, { transaction: t });
  }
  await newSlot.update({ status: SLOT_STATUS.BOOKED }, { transaction: t });

  const bySystem = by === 'system';
  await appt.update(
    {
      slotId: newSlot.id,
      startAt: newSlot.startAt,
      endAt: newSlot.endAt,
      previousStartAt,
      rescheduleCount: appt.rescheduleCount + 1,
      autoRescheduleCount: appt.autoRescheduleCount + (bySystem ? 1 : 0),
      // The patient picked the new time themselves, so it counts as confirmed; a system move needs confirming.
      status: bySystem ? S.PENDING_CONFIRMATION : S.CONFIRMED,
      confirmedAt: bySystem ? null : new Date()
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
  const slot = await findNextSlot({ doctorId: appt.doctorId, after: appt.startAt, userId: actor.id, excludeAppointmentId: appt.id });
  if (!slot) {
    throw AppError.notFound('No later slot is available with this doctor right now. You can cancel the appointment instead.', 'NO_SLOT_AVAILABLE');
  }
  return { appointment: present(appt, actor), nextSlot: slot };
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
      if (isInsideLockWindow(slot.startAt)) throw AppError.rule(`The new slot must be more than ${LOCK_WINDOW_HOURS} hours away`, 'LOCK_WINDOW');
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
  await appt.update({ status: S.CANCELLED, cancelledAt: new Date(now), cancelledBy: by, cancelReason: reason || null }, { transaction: t });

  if (appt.slotId && ms(appt.startAt) > now) {
    const slot = await Slot.findByPk(appt.slotId, { transaction: t, lock: t.LOCK.UPDATE });
    // A doctor who cancels is not available then, so the slot is blocked instead of reopened.
    if (slot) await slot.update({ status: by === ROLES.DOCTOR ? SLOT_STATUS.BLOCKED : SLOT_STATUS.AVAILABLE }, { transaction: t });
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
    return prescription;
  });
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
  const appt = await Appointment.findByPk(id, { include: [patientInclude, doctorInclude, { model: Prescription, as: 'prescription' }] });
  if (!appt) throw AppError.notFound('Appointment not found');
  assertParticipant(appt, actor);
  return present(appt, actor);
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
  list,
  getById,
  processUnconfirmed,
  cancelFutureFor,
  present
};
