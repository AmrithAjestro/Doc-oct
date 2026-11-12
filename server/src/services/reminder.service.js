const { Op } = require('sequelize');
const config = require('../config/config');
const { REMINDER_TYPES, APPOINTMENT_STATUS, ACTIVE_APPOINTMENT_STATUSES } = require('../config/constants');
const { sequelize, Reminder, Appointment, DoctorProfile, User } = require('../models');
const { HOUR, MINUTE, formatDateTime } = require('../utils/helpers');
const { notify } = require('./notification.service');

const { LOCK_WINDOW_HOURS, CONFIRM_NUDGE_HOURS } = config.RULES;

/** Offsets before the appointment start. */
const SCHEDULE = [
  {
    type: REMINDER_TYPES.CONFIRM,
    before: (LOCK_WINDOW_HOURS + CONFIRM_NUDGE_HOURS) * HOUR,
    appliesTo: (appt) => appt.status === APPOINTMENT_STATUS.PENDING_CONFIRMATION
  },
  { type: REMINDER_TYPES.DAY, before: 24 * HOUR },
  { type: REMINDER_TYPES.HOUR, before: HOUR },
  { type: REMINDER_TYPES.QUARTER, before: 15 * MINUTE }
];

const doctorName = (appt) => `Dr. ${appt.doctor?.user?.name || 'your doctor'}`;

const MESSAGES = {
  [REMINDER_TYPES.CONFIRM]: (a) => ({
    title: 'Please confirm your appointment',
    message: `Please confirm your appointment with ${doctorName(a)} on ${formatDateTime(a.startAt)}. If it is not confirmed by ${formatDateTime(
      new Date(a.startAt).getTime() - LOCK_WINDOW_HOURS * HOUR
    )}, it will be moved to the next available slot.`
  }),
  [REMINDER_TYPES.DAY]: (a) => ({
    title: 'Appointment tomorrow',
    message: `Reminder: your appointment with ${doctorName(a)} is in 24 hours (${formatDateTime(a.startAt)}).`
  }),
  [REMINDER_TYPES.HOUR]: (a) => ({
    title: 'Appointment in 1 hour',
    message: `Your appointment with ${doctorName(a)} starts in 1 hour (${formatDateTime(a.startAt)}).`
  }),
  [REMINDER_TYPES.QUARTER]: (a) => ({
    title: 'Appointment in 15 minutes',
    message: `Your appointment with ${doctorName(a)} starts in 15 minutes. Please be ready.`
  })
};

/** Creates the reminders that still lie in the future (a booking 5 h ahead gets no 1-day reminder). */
async function scheduleFor(appointment, transaction) {
  const now = Date.now();
  const start = new Date(appointment.startAt).getTime();
  const rows = SCHEDULE.filter((s) => !s.appliesTo || s.appliesTo(appointment))
    .map((s) => ({ appointmentId: appointment.id, type: s.type, sendAt: new Date(start - s.before) }))
    .filter((r) => r.sendAt.getTime() > now);
  if (rows.length) await Reminder.bulkCreate(rows, { transaction });
}

async function cancelPending(appointmentId, transaction, types) {
  const where = { appointmentId, status: 'pending' };
  if (types) where.type = types;
  await Reminder.destroy({ where, transaction });
}

/** After a time change: drop everything not yet sent and schedule again for the new time. */
async function resetFor(appointment, transaction) {
  await cancelPending(appointment.id, transaction);
  await scheduleFor(appointment, transaction);
}

/**
 * Sends every due reminder exactly once. Rows are claimed with FOR UPDATE SKIP LOCKED, so two
 * server instances running the job at the same moment never send the same reminder twice.
 */
async function processDue() {
  return sequelize.transaction(async (t) => {
    const due = await Reminder.findAll({
      where: { status: 'pending', sendAt: { [Op.lte]: new Date() } },
      order: [['sendAt', 'ASC']],
      limit: 100,
      lock: t.LOCK.UPDATE,
      skipLocked: true,
      transaction: t
    });
    if (!due.length) return 0;

    const appointments = await Appointment.findAll({
      where: { id: [...new Set(due.map((r) => r.appointmentId))] },
      include: [{ model: DoctorProfile, as: 'doctor', include: [{ model: User, as: 'user', attributes: ['id', 'name'] }] }],
      transaction: t
    });
    const byId = new Map(appointments.map((a) => [a.id, a]));
    const now = Date.now();

    for (const reminder of due) {
      const appt = byId.get(reminder.appointmentId);
      const stale =
        !appt ||
        !ACTIVE_APPOINTMENT_STATUSES.includes(appt.status) ||
        new Date(appt.startAt).getTime() <= now ||
        (reminder.type === REMINDER_TYPES.CONFIRM && appt.status !== APPOINTMENT_STATUS.PENDING_CONFIRMATION) ||
        // Still unconfirmed past its deadline: the scheduler is about to move it, so a reminder for the old time is wrong.
        (appt.status === APPOINTMENT_STATUS.PENDING_CONFIRMATION &&
          new Date(appt.startAt).getTime() - now <= LOCK_WINDOW_HOURS * HOUR);

      if (stale) {
        await reminder.update({ status: 'skipped', sentAt: new Date() }, { transaction: t });
        continue;
      }

      const { title, message } = MESSAGES[reminder.type](appt);
      await notify(appt.userId, { type: `reminder_${reminder.type}`, title, message, appointmentId: appt.id }, t);
      if (reminder.type === REMINDER_TYPES.HOUR && appt.doctor?.user) {
        await notify(
          appt.doctor.user.id,
          {
            type: 'reminder_hour',
            title: 'Upcoming appointment',
            message: `You have an appointment at ${formatDateTime(appt.startAt)} (in 1 hour).`,
            appointmentId: appt.id
          },
          t
        );
      }
      await reminder.update({ status: 'sent', sentAt: new Date() }, { transaction: t });
    }
    return due.length;
  });
}

module.exports = { scheduleFor, cancelPending, resetFor, processDue };
