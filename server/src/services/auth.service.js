const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const { sendMailSafe, getBrand } = require('./mailer.service');
const tpl = require('./emailTemplates');
const { ROLES } = require('../config/constants');
const { sequelize, User, DoctorProfile } = require('../models');
const AppError = require('../utils/AppError');
const { signToken } = require('../middlewares/auth.middleware');
const { notify } = require('./notification.service');

const BCRYPT_ROUNDS = 10;

// A real hash compared against when the e-mail is unknown, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

async function loadSession(userId) {
  const user = await User.findByPk(userId, { include: [{ model: DoctorProfile, as: 'doctorProfile' }] });
  return { token: signToken(user), user };
}

async function registerUser({ name, email, phone, password }) {
  const user = await User.create({ name, email, phone, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), role: ROLES.USER });
  getBrand().then((b) => sendMailSafe({ to: user.email, ...tpl.welcomePatient(user, b) }, 'welcome'));
  return loadSession(user.id);
}

async function registerDoctor(data, file) {
  if (!file) throw AppError.badRequest('Please upload your medical registration certificate', 'CERTIFICATE_REQUIRED');
  const { name, email, phone, password, ...profile } = data;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const created = await sequelize.transaction(async (t) => {
    const user = await User.create(
      { name: name.replace(/^dr\.?\s+/i, ''), email, phone, passwordHash, role: ROLES.DOCTOR },
      { transaction: t }
    );
    await DoctorProfile.create(
      {
        ...profile,
        userId: user.id,
        certificatePath: file.filename,
        certificateName: file.originalname.slice(0, 250),
        certificateMimeType: file.mimetype
      },
      { transaction: t }
    );
    const admins = await User.findAll({ where: { role: ROLES.ADMIN, isActive: true }, attributes: ['id'], transaction: t });
    for (const admin of admins) {
      await notify(admin.id, { type: 'doctor_registered', title: 'New doctor awaiting approval', message: `Dr. ${user.name} (${profile.specialization}) registered and is waiting for certificate review.` }, t);
    }
    return user;
  });
  getBrand().then((b) => sendMailSafe({ to: created.email, ...tpl.welcomeDoctor(created, profile, b) }, 'welcome'));
  return loadSession(created.id);
}

async function login({ email, password }, meta = {}) {
  const user = await User.scope('withPassword').findOne({ where: { email: email.trim().toLowerCase() } });
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !valid) throw AppError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  if (!user.isActive) throw AppError.forbidden('Your account has been deactivated. Contact support.', 'ACCOUNT_INACTIVE');
  getBrand().then((b) => sendMailSafe({ to: user.email, ...tpl.loginAlert(user, meta, b) }, 'login alert'));
  return loadSession(user.id);
}

async function updateMe(user, { name, phone }) {
  await user.update({ ...(name && { name }), ...(phone !== undefined && { phone }) });
  return user;
}

/** Changing the password signs out every other device; the caller gets a fresh token. */
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw AppError.badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  }
  await user.update({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), tokenVersion: user.tokenVersion + 1 });
  getBrand().then((b) => sendMailSafe({ to: user.email, ...tpl.passwordChanged(user, b) }, 'password changed'));
  return loadSession(user.id);
}

/** Revokes every token issued for this user, on every device. */
async function logoutEverywhere(user) {
  await User.increment('tokenVersion', { where: { id: user.id } });
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Sends a one-time reset link (valid RESET_TOKEN_MINUTES). Only a hash of the token is stored.
 * The answer is the same whether or not the e-mail exists, so accounts cannot be discovered.
 */
async function requestPasswordReset({ email }) {
  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.isActive) return;
  const token = crypto.randomBytes(32).toString('hex');
  await user.update({ resetTokenHash: sha256(token), resetTokenExpiresAt: new Date(Date.now() + config.RESET_TOKEN_MINUTES * 60000) });
  const link = `${config.APP_URL}/reset-password?token=${token}`;
  if (!config.IS_PRODUCTION) console.log(`[password reset] ${user.email}: ${link}`);
  await sendMailSafe({ to: user.email, ...tpl.passwordReset(user, link, config.RESET_TOKEN_MINUTES, await getBrand()) }, 'password reset');
}

async function resetPassword({ token, password }) {
  const user = await User.scope('withPassword').findOne({ where: { resetTokenHash: sha256(token) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw AppError.badRequest('This reset link is invalid or has expired. Ask for a new one.', 'RESET_TOKEN_INVALID');
  }
  await user.update({
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    tokenVersion: user.tokenVersion + 1
  });
  getBrand().then((b) => sendMailSafe({ to: user.email, ...tpl.passwordChanged(user, b) }, 'password changed'));
  return loadSession(user.id);
}

module.exports = { registerUser, registerDoctor, login, loadSession, updateMe, changePassword, logoutEverywhere, requestPasswordReset, resetPassword, BCRYPT_ROUNDS };
