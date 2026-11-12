const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { ROLES, DOCTOR_STATUS } = require('../config/constants');
const { User, DoctorProfile } = require('../models');
const AppError = require('../utils/AppError');
const { asyncHandler } = require('../utils/helpers');

const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

/**
 * Verifies the bearer token and loads the user fresh from the database on every request,
 * so a deactivation or role change takes effect immediately rather than when the token expires.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw AppError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch {
    throw AppError.unauthorized('Your session has expired. Please sign in again.', 'TOKEN_INVALID');
  }

  const user = await User.findByPk(payload.sub, { include: [{ model: DoctorProfile, as: 'doctorProfile' }] });
  if (!user) throw AppError.unauthorized('Account not found', 'ACCOUNT_NOT_FOUND');
  if (!user.isActive) throw AppError.unauthorized('Your account has been deactivated. Contact support.', 'ACCOUNT_INACTIVE');

  req.user = user;
  next();
});

const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };

/** Doctors can sign in while their certificate is under review, but cannot practise until approved. */
const requireApprovedDoctor = (req, res, next) => {
  if (req.user?.role !== ROLES.DOCTOR) return next(AppError.forbidden());
  if (req.user.doctorProfile?.status !== DOCTOR_STATUS.APPROVED) {
    return next(AppError.forbidden('Your profile is awaiting admin approval', 'DOCTOR_NOT_APPROVED'));
  }
  next();
};

module.exports = { signToken, authenticate, requireRole, requireApprovedDoctor };
