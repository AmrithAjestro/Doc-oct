const bcrypt = require('bcryptjs');
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
  return loadSession(user.id);
}

async function registerDoctor(data, file) {
  if (!file) throw AppError.badRequest('Please upload your medical registration certificate', 'CERTIFICATE_REQUIRED');
  const { name, email, phone, password, ...profile } = data;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const userId = await sequelize.transaction(async (t) => {
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
    return user.id;
  });
  return loadSession(userId);
}

async function login({ email, password }) {
  const user = await User.scope('withPassword').findOne({ where: { email: email.trim().toLowerCase() } });
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !valid) throw AppError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  if (!user.isActive) throw AppError.forbidden('Your account has been deactivated. Contact support.', 'ACCOUNT_INACTIVE');
  return loadSession(user.id);
}

async function updateMe(user, { name, phone }) {
  await user.update({ ...(name && { name }), ...(phone !== undefined && { phone }) });
  return user;
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw AppError.badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  }
  await user.update({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
}

module.exports = { registerUser, registerDoctor, login, loadSession, updateMe, changePassword, BCRYPT_ROUNDS };
