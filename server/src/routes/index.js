const express = require('express');
const rateLimit = require('express-rate-limit');
const { ROLES } = require('../config/constants');
const { authenticate, requireRole, requireApprovedDoctor } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { certificateUpload, logoUpload } = require('../middlewares/upload.middleware');
const v = require('../validators');
const { asyncHandler: h, ok } = require('../utils/helpers');
const { getSettings } = require('../services/settings.service');
const dashboardService = require('../services/dashboard.service');

const auth = require('../controllers/auth.controller');
const doctor = require('../controllers/doctor.controller');
const appointment = require('../controllers/appointment.controller');
const notification = require('../controllers/notification.controller');
const admin = require('../controllers/admin.controller');

const router = express.Router();
const id = validate({ params: v.idParam });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please try again in a few minutes.' }
});

/* ---------------------------------------------------------------- public */

router.get('/health', (req, res) => ok(res, { status: 'ok', time: new Date() }));

router.get(
  '/settings/public',
  h(async (req, res) => {
    const s = (await getSettings()).toJSON();
    ok(res, {
      appName: s.appName,
      tagline: s.tagline,
      logoUrl: s.logoUrl,
      currency: s.currency,
      commissionType: s.commissionType,
      commissionValue: s.commissionValue,
      supportEmail: s.supportEmail
    });
  })
);

/* ------------------------------------------------------------------ auth */

router.post('/auth/register', authLimiter, validate({ body: v.auth.registerUser }), h(auth.registerUser));
router.post('/auth/register/doctor', authLimiter, certificateUpload, validate({ body: v.auth.registerDoctor }), h(auth.registerDoctor));
router.post('/auth/login', authLimiter, validate({ body: v.auth.login }), h(auth.login));
router.get('/auth/me', authenticate, h(auth.me));
router.patch('/auth/me', authenticate, validate({ body: v.auth.updateMe }), h(auth.updateMe));
router.post('/auth/change-password', authenticate, authLimiter, validate({ body: v.auth.changePassword }), h(auth.changePassword));

/* ------------------------------------------------------- doctors (browse) */

router.get('/doctors', validate({ query: v.doctor.publicList }), h(doctor.list));
router.get('/doctors/specializations', h(doctor.specializations));
router.get('/doctors/:id', id, h(doctor.get));
router.get('/doctors/:id/slots', validate({ params: v.idParam, query: v.doctor.range }), h(doctor.availableSlots));
router.get('/doctors/:id/certificate', authenticate, id, h(admin.downloadCertificate));

/* -------------------------------------------------- signed-in doctor ("me") */

const doctorOnly = [authenticate, requireRole(ROLES.DOCTOR)];
router.get('/doctor/profile', doctorOnly, h(doctor.myProfile));
router.patch('/doctor/profile', doctorOnly, validate({ body: v.doctor.updateProfile }), h(doctor.updateProfile));
router.put('/doctor/profile/certificate', doctorOnly, certificateUpload, h(doctor.replaceCertificate));
router.get('/doctor/slots', doctorOnly, requireApprovedDoctor, validate({ query: v.doctor.range }), h(doctor.mySlots));
router.post('/doctor/slots', doctorOnly, requireApprovedDoctor, validate({ body: v.doctor.createSlots }), h(doctor.createSlots));
router.delete('/doctor/slots/:id', doctorOnly, requireApprovedDoctor, id, h(doctor.deleteSlot));
router.post('/doctor/slots/:id/unblock', doctorOnly, requireApprovedDoctor, id, h(doctor.unblockSlot));

/* ---------------------------------------------------------- appointments */

const patientOnly = requireRole(ROLES.USER);
const approvedDoctor = [requireRole(ROLES.DOCTOR), requireApprovedDoctor];

router.get('/appointments', authenticate, validate({ query: v.appointment.list }), h(appointment.list));
router.post('/appointments', authenticate, patientOnly, validate({ body: v.appointment.book }), h(appointment.book));
router.get('/appointments/:id', authenticate, id, h(appointment.get));
router.post('/appointments/:id/confirm', authenticate, patientOnly, id, h(appointment.confirm));
router.get('/appointments/:id/reschedule-preview', authenticate, patientOnly, id, h(appointment.reschedulePreview));
router.post('/appointments/:id/reschedule', authenticate, patientOnly, validate({ params: v.idParam, body: v.appointment.reschedule }), h(appointment.reschedule));
router.post('/appointments/:id/cancel', authenticate, validate({ params: v.idParam, body: v.appointment.cancel }), h(appointment.cancel));
router.post('/appointments/:id/complete', authenticate, approvedDoctor, validate({ params: v.idParam, body: v.appointment.complete }), h(appointment.complete));
router.post('/appointments/:id/no-show', authenticate, approvedDoctor, id, h(appointment.noShow));
router.put('/appointments/:id/prescription', authenticate, approvedDoctor, validate({ params: v.idParam, body: v.appointment.prescription }), h(appointment.savePrescription));

/* --------------------------------------------------------- notifications */

router.get('/notifications', authenticate, validate({ query: v.notification.list }), h(notification.list));
router.get('/notifications/unread-count', authenticate, h(notification.unreadCount));
router.patch('/notifications/read-all', authenticate, h(notification.markAllRead));
router.patch('/notifications/:id/read', authenticate, id, h(notification.markRead));

/* ------------------------------------------------------------- dashboard */

router.get('/dashboard', authenticate, h(async (req, res) => ok(res, await dashboardService.forActor(req.user))));

/* ----------------------------------------------------------------- admin */

const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];
router.get('/admin/doctors', adminOnly, validate({ query: v.admin.doctors }), h(admin.listDoctors));
router.get('/admin/doctors/:id', adminOnly, id, h(admin.getDoctor));
router.patch('/admin/doctors/:id/status', adminOnly, validate({ params: v.idParam, body: v.admin.reviewDoctor }), h(admin.reviewDoctor));
router.get('/admin/users', adminOnly, validate({ query: v.admin.users }), h(admin.listUsers));
router.patch('/admin/users/:id/status', adminOnly, validate({ params: v.idParam, body: v.admin.userStatus }), h(admin.setUserStatus));
router.get('/admin/settings', adminOnly, h(admin.getSettings));
router.put('/admin/settings', adminOnly, validate({ body: v.admin.settings }), h(admin.updateSettings));
router.put('/admin/settings/logo', adminOnly, logoUpload, h(admin.updateLogo));
router.delete('/admin/settings/logo', adminOnly, h(admin.removeLogo));

module.exports = router;
