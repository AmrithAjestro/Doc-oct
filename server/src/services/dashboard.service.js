const { Op, fn, col } = require('sequelize');
const { ROLES, DOCTOR_STATUS, SLOT_STATUS, APPOINTMENT_STATUS: S, ACTIVE_APPOINTMENT_STATUSES: ACTIVE } = require('../config/constants');
const { Appointment, User, DoctorProfile, Slot, Prescription, Notification } = require('../models');
const { DAY, roundMoney } = require('../utils/helpers');
const { present } = require('./appointment.service');

const doctorInclude = { model: DoctorProfile, as: 'doctor', include: [{ model: User, as: 'user', attributes: ['id', 'name'] }] };
const patientInclude = { model: User, as: 'patient', attributes: ['id', 'name', 'phone'] };

const countByStatus = async (where) => {
  const rows = await Appointment.findAll({ where, attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true });
  const out = Object.fromEntries(Object.values(S).map((s) => [s, 0]));
  rows.forEach((r) => (out[r.status] = Number(r.count)));
  return out;
};

const sum = async (field, where) => roundMoney((await Appointment.sum(field, { where })) || 0);

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function forUser(user) {
  const now = new Date();
  const [statusCounts, upcoming, prescriptions, unread] = await Promise.all([
    countByStatus({ userId: user.id }),
    Appointment.findAll({
      where: { userId: user.id, status: { [Op.in]: ACTIVE }, endAt: { [Op.gte]: now } },
      include: [doctorInclude],
      order: [['startAt', 'ASC']],
      limit: 5
    }),
    Prescription.count({ include: [{ model: Appointment, as: 'appointment', where: { userId: user.id }, attributes: [] }] }),
    Notification.count({ where: { userId: user.id, readAt: null } })
  ]);
  return {
    statusCounts,
    upcoming: upcoming.map((a) => present(a, user)),
    awaitingConfirmation: upcoming.filter((a) => a.status === S.PENDING_CONFIRMATION).length,
    prescriptions,
    unreadNotifications: unread,
    totalSpent: await sum('totalFee', { userId: user.id, status: S.COMPLETED })
  };
}

async function forDoctor(user) {
  const profile = user.doctorProfile;
  if (!profile || profile.status !== DOCTOR_STATUS.APPROVED) return { profileStatus: profile?.status, rejectionReason: profile?.rejectionReason };
  const doctorId = profile.id;
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + DAY);
  const now = new Date();

  const [statusCounts, todays, upcomingCount, openSlots, earnings, patients] = await Promise.all([
    countByStatus({ doctorId }),
    Appointment.findAll({
      where: { doctorId, startAt: { [Op.gte]: today, [Op.lt]: tomorrow }, status: { [Op.ne]: S.CANCELLED } },
      include: [patientInclude],
      order: [['startAt', 'ASC']]
    }),
    Appointment.count({ where: { doctorId, status: { [Op.in]: ACTIVE }, startAt: { [Op.gte]: now } } }),
    Slot.count({ where: { doctorId, status: SLOT_STATUS.AVAILABLE, startAt: { [Op.gt]: now } } }),
    sum('doctorFee', { doctorId, status: S.COMPLETED }),
    Appointment.count({ where: { doctorId, status: S.COMPLETED }, distinct: true, col: 'user_id' })
  ]);
  return {
    profileStatus: profile.status,
    statusCounts,
    today: todays.map((a) => present(a, user)),
    upcomingCount,
    openSlots,
    earnings,
    uniquePatients: patients
  };
}

async function forAdmin() {
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + DAY);
  const [patients, doctorsByStatus, statusCounts, todayCount, commission, gross, recent, pendingDoctors] = await Promise.all([
    User.count({ where: { role: ROLES.USER } }),
    DoctorProfile.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true }),
    countByStatus({}),
    Appointment.count({ where: { startAt: { [Op.gte]: today, [Op.lt]: tomorrow }, status: { [Op.ne]: S.CANCELLED } } }),
    sum('commission', { status: S.COMPLETED }),
    sum('totalFee', { status: S.COMPLETED }),
    Appointment.findAll({ include: [patientInclude, doctorInclude], order: [['createdAt', 'DESC']], limit: 6 }),
    DoctorProfile.findAll({ where: { status: DOCTOR_STATUS.PENDING }, include: [{ model: User, as: 'user' }], order: [['createdAt', 'ASC']], limit: 5 })
  ]);
  const doctors = Object.fromEntries(Object.values(DOCTOR_STATUS).map((s) => [s, 0]));
  doctorsByStatus.forEach((r) => (doctors[r.status] = Number(r.count)));

  return {
    patients,
    doctors,
    statusCounts,
    todayCount,
    revenue: { commission, gross },
    recentAppointments: recent,
    pendingDoctors
  };
}

const forActor = (user) => (user.role === ROLES.ADMIN ? forAdmin() : user.role === ROLES.DOCTOR ? forDoctor(user) : forUser(user));

module.exports = { forActor };
