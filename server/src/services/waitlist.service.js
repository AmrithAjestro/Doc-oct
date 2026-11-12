const { Op } = require('sequelize');
const config = require('../config/config');
const { DOCTOR_STATUS } = require('../config/constants');
const { WaitlistEntry, DoctorProfile, User } = require('../models');
const AppError = require('../utils/AppError');
const { formatDateTime } = require('../utils/helpers');
const { notify } = require('./notification.service');
const { insideLateWindow } = require('../utils/runningLate');

// Do not send the same patient another "a time opened" message within this period.
const QUIET_MINUTES = 30;

/** The calendar day of an instant in the clinic's zone, YYYY-MM-DD. */
const clinicDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: config.DISPLAY_TIMEZONE }).format(new Date(d));

async function join(actor, doctorId, { date }) {
  const doctor = await DoctorProfile.findOne({ where: { id: doctorId, status: DOCTOR_STATUS.APPROVED } });
  if (!doctor) throw AppError.notFound('Doctor not found');
  const [entry, created] = await WaitlistEntry.findOrCreate({
    where: { userId: actor.id, doctorId },
    defaults: { userId: actor.id, doctorId, preferredDate: date || null }
  });
  if (!created) await entry.update({ preferredDate: date || null, lastNotifiedAt: null });
  return entry;
}

async function leave(actor, doctorId) {
  await WaitlistEntry.destroy({ where: { userId: actor.id, doctorId } });
}

const mine = (actor) =>
  WaitlistEntry.findAll({
    where: { userId: actor.id },
    include: [{ model: DoctorProfile, as: 'doctor', attributes: ['id', 'specialization'], include: [{ model: User, as: 'user', attributes: ['name'] }] }],
    order: [['createdAt', 'DESC']]
  });

/** Booking with the doctor takes the patient off that doctor's waitlist. */
const removeOnBooking = (userId, doctorId, transaction) => WaitlistEntry.destroy({ where: { userId, doctorId }, transaction });

/**
 * Called after slots of a doctor become free. Every waiting patient whose date matches (or who
 * has no date) is told, oldest request first. Whoever books first gets the slot.
 */
async function notifyOpenings(doctorId, slots) {
  const future = (slots || []).filter((s) => new Date(s.startAt) > new Date()).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  if (!future.length) return 0;
  const doctor = await DoctorProfile.findByPk(doctorId, { include: [{ model: User, as: 'user', attributes: ['name'] }] });
  if (!doctor || doctor.status !== DOCTOR_STATUS.APPROVED) return 0;
  // Times the doctor cannot keep because they are running late are not offered.
  const offer = future.filter((s) => !insideLateWindow(doctor, s.startAt));
  if (!offer.length) return 0;

  const quietSince = new Date(Date.now() - QUIET_MINUTES * 60000);
  const entries = await WaitlistEntry.findAll({
    where: { doctorId, [Op.or]: [{ lastNotifiedAt: null }, { lastNotifiedAt: { [Op.lt]: quietSince } }] },
    order: [['createdAt', 'ASC']]
  });
  let sent = 0;
  for (const e of entries) {
    const match = e.preferredDate ? offer.find((s) => clinicDay(s.startAt) === e.preferredDate) : offer[0];
    if (!match) continue;
    await notify(e.userId, {
      type: 'waitlist_opening',
      title: 'A time opened up',
      message: `Dr. ${doctor.user?.name} now has a free time on ${formatDateTime(match.startAt)}. Book it in the app before someone else does.`
    });
    await e.update({ lastNotifiedAt: new Date() });
    sent += 1;
  }
  return sent;
}

/** Fire-and-forget wrapper: a failed waitlist message never breaks the action that freed the slot. */
const announce = (doctorId, slots) => {
  notifyOpenings(doctorId, slots).catch((err) => console.error('[waitlist] notify failed:', err.message));
};

module.exports = { join, leave, mine, removeOnBooking, notifyOpenings, announce, clinicDay };
