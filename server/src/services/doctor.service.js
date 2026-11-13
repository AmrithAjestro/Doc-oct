const { Op, fn, col, literal } = require('sequelize');
const config = require('../config/config');
const { DOCTOR_STATUS, SLOT_STATUS } = require('../config/constants');
const path = require('path');
const { sequelize, DoctorProfile, User, Slot, Appointment, Review } = require('../models');
const AppError = require('../utils/AppError');
const { DAY, MINUTE, parsePagination, pageMeta } = require('../utils/helpers');
const { calculateFee } = require('../utils/helpers');
const { getSettings } = require('./settings.service');
const { removeFile } = require('../middlewares/upload.middleware');
const waitlist = require('./waitlist.service');

const { MIN_SLOT_MINUTES, MAX_SLOT_MINUTES, MAX_SLOT_RANGE_DAYS } = config.RULES;

const publicUser = { model: User, as: 'user', attributes: ['id', 'name'], where: { isActive: true } };

const nextAvailableAt = literal(
  `(SELECT MIN(s.start_at) FROM slots s WHERE s.doctor_id = "DoctorProfile"."id" AND s.status = '${SLOT_STATUS.AVAILABLE}' AND s.start_at > NOW())`
);

const ratingAvg = literal('(SELECT ROUND(AVG(r.rating)::numeric, 1) FROM reviews r WHERE r.doctor_id = "DoctorProfile"."id")');
const ratingCount = literal('(SELECT COUNT(*) FROM reviews r WHERE r.doctor_id = "DoctorProfile"."id")');
const ratingAttrs = [[ratingAvg, 'ratingAvg'], [ratingCount, 'ratingCount']];

const withPricing = (doctor, settings) => {
  const json = doctor.toJSON();
  json.pricing = calculateFee(doctor.fee, settings);
  json.ratingAvg = json.ratingAvg == null ? null : Number(json.ratingAvg);
  json.ratingCount = Number(json.ratingCount || 0);
  delete json.rejectionReason;
  delete json.reviewedBy;
  return json;
};

// public browsing

async function listPublic(query) {
  const paging = parsePagination(query, { defaultLimit: 12, maxLimit: 50 });
  const where = { status: DOCTOR_STATUS.APPROVED };
  if (query.specialization) where.specialization = { [Op.iLike]: query.specialization };
  if (query.search) {
    const term = `%${query.search}%`;
    where[Op.or] = [{ '$user.name$': { [Op.iLike]: term } }, { specialization: { [Op.iLike]: term } }, { qualification: { [Op.iLike]: term } }];
  }

  const [settings, { rows, count }] = await Promise.all([
    getSettings(),
    DoctorProfile.findAndCountAll({
      where,
      include: [publicUser],
      attributes: { include: [[nextAvailableAt, 'nextAvailableAt'], ...ratingAttrs], exclude: ['certificatePath', 'certificateMimeType'] },
      // Doctors with the soonest free slot first; those with no availability last.
      order: [[literal('"nextAvailableAt"'), 'ASC NULLS LAST'], ['createdAt', 'DESC']],
      limit: paging.limit,
      offset: paging.offset,
      distinct: true
    })
  ]);
  return { rows: rows.map((d) => withPricing(d, settings)), meta: pageMeta(paging, count) };
}

async function specializations() {
  const rows = await DoctorProfile.findAll({
    where: { status: DOCTOR_STATUS.APPROVED },
    include: [{ ...publicUser, attributes: [] }],
    attributes: ['specialization', [fn('COUNT', col('DoctorProfile.id')), 'count']],
    group: ['specialization'],
    order: [['specialization', 'ASC']],
    raw: true
  });
  return rows.map((r) => ({ name: r.specialization, count: Number(r.count) }));
}

async function getPublic(id) {
  const doctor = await DoctorProfile.findOne({
    where: { id, status: DOCTOR_STATUS.APPROVED },
    include: [publicUser],
    attributes: { include: [[nextAvailableAt, 'nextAvailableAt'], ...ratingAttrs] }
  });
  if (!doctor) throw AppError.notFound('Doctor not found');
  return withPricing(doctor, await getSettings());
}

function clampRange(from, to, maxDays) {
  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date(start.getTime() + 14 * DAY);
  if (end <= start) throw AppError.badRequest('"to" must be after "from"');
  if (end - start > maxDays * DAY) throw AppError.badRequest(`Range can be at most ${maxDays} days`);
  return { start, end };
}

async function availableSlots(doctorId, { from, to }) {
  const doctor = await DoctorProfile.findOne({ where: { id: doctorId, status: DOCTOR_STATUS.APPROVED }, include: [publicUser] });
  if (!doctor) throw AppError.notFound('Doctor not found');
  const { start, end } = clampRange(from, to, 60);
  const now = new Date();
  return Slot.findAll({
    where: { doctorId, status: SLOT_STATUS.AVAILABLE, startAt: { [Op.gte]: start > now ? start : now, [Op.lt]: end } },
    attributes: ['id', 'startAt', 'endAt'],
    order: [['startAt', 'ASC']]
  });
}

/** Latest reviews of a doctor, with the reviewer's first name only. */
async function reviews(doctorId, query) {
  const paging = parsePagination(query, { defaultLimit: 10, maxLimit: 50 });
  const { rows, count } = await Review.findAndCountAll({
    where: { doctorId },
    include: [{ model: User, as: 'patient', attributes: ['name'] }],
    order: [['createdAt', 'DESC']],
    limit: paging.limit,
    offset: paging.offset
  });
  const data = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    author: (r.patient?.name || 'Patient').split(' ')[0]
  }));
  return { rows: data, meta: pageMeta(paging, count) };
}

// doctor: profile

async function updateProfile(profile, data) {
  const { name, phone, ...profileData } = data;
  await sequelize.transaction(async (t) => {
    if (name || phone !== undefined) {
      await User.update({ ...(name && { name }), ...(phone !== undefined && { phone }) }, { where: { id: profile.userId }, transaction: t });
    }
    await profile.update(profileData, { transaction: t });
  });
  return DoctorProfile.findByPk(profile.id, { include: [{ model: User, as: 'user' }] });
}

async function updatePhoto(profile, file) {
  if (!file) throw AppError.badRequest('Please attach a photo', 'FILE_REQUIRED');
  const old = profile.photoPath;
  await profile.update({ photoPath: file.filename });
  if (old) removeFile(path.join(config.UPLOAD_DIR, 'photos', path.basename(old)));
  return profile;
}

async function removePhoto(profile) {
  if (profile.photoPath) removeFile(path.join(config.UPLOAD_DIR, 'photos', path.basename(profile.photoPath)));
  return profile.update({ photoPath: null });
}

/** A rejected or pending doctor uploads a new certificate and goes back into the review queue. */
async function replaceCertificate(profile, file) {
  if (!file) throw AppError.badRequest('Please attach the certificate file', 'FILE_REQUIRED');
  if (profile.status === DOCTOR_STATUS.APPROVED) {
    removeFile(file.path);
    throw AppError.conflict('Your profile is already approved. Contact the admin to change your certificate.', 'ALREADY_APPROVED');
  }
  const oldPath = profile.certificatePath;
  await profile.update({
    certificatePath: file.filename,
    certificateName: file.originalname.slice(0, 250),
    certificateMimeType: file.mimetype,
    status: DOCTOR_STATUS.PENDING,
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null
  });
  if (oldPath && oldPath !== file.filename) removeFile(require('path').join(config.UPLOAD_DIR, 'certificates', oldPath));
  return profile;
}

// doctor: slots

async function listOwnSlots(profile, { from, to }) {
  const { start, end } = clampRange(from, to, MAX_SLOT_RANGE_DAYS);
  return Slot.findAll({
    where: { doctorId: profile.id, startAt: { [Op.gte]: start, [Op.lt]: end } },
    include: [
      {
        model: Appointment,
        as: 'appointments',
        required: false,
        where: { status: { [Op.in]: ['pending_confirmation', 'confirmed', 'completed', 'no_show'] } },
        attributes: ['id', 'status'],
        include: [{ model: User, as: 'patient', attributes: ['id', 'name'] }]
      }
    ],
    order: [['startAt', 'ASC']]
  });
}

/**
 * Adds slots in bulk. The client sends exact instants (it knows the doctor's time zone).
 * Slots that overlap each other or an existing slot are skipped and reported, the rest are created.
 */
async function createSlots(profile, slots) {
  const now = Date.now();
  const skipped = [];
  const valid = [];

  for (const s of slots) {
    const startAt = new Date(s.startAt);
    const endAt = new Date(s.endAt);
    const minutes = (endAt - startAt) / MINUTE;
    let problem = null;
    if (startAt.getTime() <= now) problem = 'in the past';
    else if (minutes < MIN_SLOT_MINUTES || minutes > MAX_SLOT_MINUTES) problem = `must be ${MIN_SLOT_MINUTES}–${MAX_SLOT_MINUTES} minutes long`;
    else if (startAt.getTime() - now > MAX_SLOT_RANGE_DAYS * DAY) problem = `more than ${MAX_SLOT_RANGE_DAYS} days ahead`;
    if (problem) skipped.push({ startAt, endAt, reason: problem });
    else valid.push({ startAt, endAt });
  }

  valid.sort((a, b) => a.startAt - b.startAt);
  const unique = [];
  for (const s of valid) {
    const prev = unique[unique.length - 1];
    if (prev && s.startAt < prev.endAt) skipped.push({ ...s, reason: 'overlaps another slot in this request' });
    else unique.push(s);
  }
  if (!unique.length) return { created: [], skipped };

  const created = await sequelize.transaction(async (t) => {
    // One slot writer per doctor at a time, so two tabs cannot create overlapping slots.
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `doctor-slots:${profile.id}` }, transaction: t });
    const existing = await Slot.findAll({
      where: { doctorId: profile.id, startAt: { [Op.lt]: unique[unique.length - 1].endAt }, endAt: { [Op.gt]: unique[0].startAt } },
      attributes: ['startAt', 'endAt'],
      transaction: t
    });
    const toCreate = unique.filter((s) => {
      const clash = existing.some((e) => s.startAt < e.endAt && s.endAt > e.startAt);
      if (clash) skipped.push({ ...s, reason: 'overlaps an existing slot' });
      return !clash;
    });
    return Slot.bulkCreate(
      toCreate.map((s) => ({ ...s, doctorId: profile.id })),
      { transaction: t, returning: true }
    );
  });

  if (created.length) waitlist.announce(profile.id, created);
  return { created, skipped };
}

async function deleteSlot(profile, slotId) {
  return sequelize.transaction(async (t) => {
    const slot = await Slot.findOne({ where: { id: slotId, doctorId: profile.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!slot) throw AppError.notFound('Slot not found');
    if (slot.status === SLOT_STATUS.BOOKED) {
      throw AppError.conflict('This slot has an appointment. Cancel the appointment first.', 'SLOT_BOOKED');
    }
    await slot.destroy({ transaction: t });
  });
}

/** Re-opens a slot the doctor blocked (e.g. after cancelling) if it is still in the future. */
async function unblockSlot(profile, slotId) {
  const slot = await Slot.findOne({ where: { id: slotId, doctorId: profile.id } });
  if (!slot) throw AppError.notFound('Slot not found');
  if (slot.status !== SLOT_STATUS.BLOCKED) throw AppError.conflict('Only a blocked slot can be reopened');
  if (slot.startAt <= new Date()) throw AppError.rule('This slot is in the past');
  await slot.update({ status: SLOT_STATUS.AVAILABLE });
  waitlist.announce(profile.id, [slot]);
  return slot;
}

module.exports = {
  listPublic,
  specializations,
  getPublic,
  availableSlots,
  reviews,
  updateProfile,
  updatePhoto,
  removePhoto,
  replaceCertificate,
  listOwnSlots,
  createSlots,
  deleteSlot,
  unblockSlot
};
