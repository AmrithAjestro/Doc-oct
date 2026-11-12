const ROLES = Object.freeze({ USER: 'user', DOCTOR: 'doctor', ADMIN: 'admin' });

const DOCTOR_STATUS = Object.freeze({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' });

const SLOT_STATUS = Object.freeze({ AVAILABLE: 'available', BOOKED: 'booked', BLOCKED: 'blocked' });

const APPOINTMENT_STATUS = Object.freeze({
  PENDING_CONFIRMATION: 'pending_confirmation',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show'
});

// Statuses that hold a slot and still lie ahead.
const ACTIVE_APPOINTMENT_STATUSES = Object.freeze([
  APPOINTMENT_STATUS.PENDING_CONFIRMATION,
  APPOINTMENT_STATUS.CONFIRMED
]);

const REMINDER_TYPES = Object.freeze({ CONFIRM: 'confirm', DAY: 'day', HOUR: 'hour', QUARTER: 'quarter' });

const COMMISSION_TYPES = Object.freeze({ PERCENTAGE: 'percentage', FLAT: 'flat' });

module.exports = {
  ROLES,
  DOCTOR_STATUS,
  SLOT_STATUS,
  APPOINTMENT_STATUS,
  ACTIVE_APPOINTMENT_STATUSES,
  REMINDER_TYPES,
  COMMISSION_TYPES
};
