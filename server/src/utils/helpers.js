const config = require('../config/config');
const { COMMISSION_TYPES } = require('../config/constants');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Wraps an async route handler so a rejected promise reaches the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const formatDateTime = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: config.DISPLAY_TIMEZONE
  }).format(new Date(value));

/** Money is stored as DECIMAL(10,2); round the same way everywhere. */
const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const parsePagination = (query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
};

const pageMeta = ({ page, limit }, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });

/**
 * What the patient pays: the doctor's fee plus the platform commission.
 * Computed only on the server and copied onto the appointment at booking, so later fee or
 * commission changes never rewrite what an existing booking costs.
 */
function calculateFee(doctorFee, settings) {
  const fee = roundMoney(doctorFee || 0);
  const value = Number(settings?.commissionValue || 0);
  const commission =
    settings?.commissionType === COMMISSION_TYPES.FLAT ? roundMoney(value) : roundMoney((fee * value) / 100);
  return { doctorFee: fee, commission, totalFee: roundMoney(fee + commission) };
}

/** Is a time inside the window in which the doctor is running late? */
function insideLateWindow(doctor, startAt, now = Date.now()) {
  const until = doctor?.runningLateUntil ? new Date(doctor.runningLateUntil).getTime() : 0;
  return until > now && new Date(startAt).getTime() < until;
}

const ok = (res, data, extra = {}, status = 200) => res.status(status).json({ success: true, data, ...extra });

module.exports = { MINUTE, HOUR, DAY, asyncHandler, formatDateTime, roundMoney, parsePagination, pageMeta, ok, calculateFee, insideLateWindow };
