const fs = require('fs');
const adminService = require('../services/admin.service');
const { getSettings } = require('../services/settings.service');
const { ROLES } = require('../config/constants');
const { DoctorProfile } = require('../models');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/helpers');

exports.listDoctors = async (req, res) => {
  const { rows, meta } = await adminService.listDoctors(req.query);
  ok(res, rows, { meta });
};
exports.getDoctor = async (req, res) => ok(res, await adminService.getDoctor(req.params.id));
exports.reviewDoctor = async (req, res) => ok(res, await adminService.reviewDoctor(req.user, req.params.id, req.body));

exports.listUsers = async (req, res) => {
  const { rows, meta } = await adminService.listUsers(req.query);
  ok(res, rows, { meta });
};
exports.setUserStatus = async (req, res) => ok(res, await adminService.setUserActive(req.user, req.params.id, req.body.isActive));

exports.getSettings = async (req, res) => ok(res, await getSettings());
exports.updateSettings = async (req, res) => ok(res, await adminService.updateSettings(req.body));
exports.updateLogo = async (req, res) => ok(res, await adminService.updateLogo(req.file));
exports.removeLogo = async (req, res) => ok(res, await adminService.removeLogo());

/** Certificates are private files: only an admin or the doctor who uploaded it may download it. */
exports.downloadCertificate = async (req, res) => {
  const doctor = await DoctorProfile.findByPk(req.params.id);
  const isOwner = req.user.role === ROLES.DOCTOR && doctor?.userId === req.user.id;
  if (!doctor || (req.user.role !== ROLES.ADMIN && !isOwner)) throw AppError.notFound('Certificate not found');
  const file = adminService.certificateFile(doctor);
  if (!fs.existsSync(file.path)) throw AppError.notFound('The certificate file is missing on the server');
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(file.path).pipe(res);
};
