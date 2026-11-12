const { Notification, User } = require('../models');
const { sendMail } = require('./mailer.service');

/**
 * Stores an in-app notification and e-mails it. Inside a transaction the e-mail waits for the
 * commit, so a rolled-back booking never sends a "booked" mail.
 */
async function notify(userId, { type, title, message, appointmentId = null }, transaction) {
  const notification = await Notification.create({ userId, type, title, message, appointmentId }, { transaction });

  const email = async () => {
    try {
      const user = await User.findByPk(userId, { attributes: ['email', 'phone', 'isActive'] });
      if (!user?.isActive) return;
      if (!user.email.endsWith('@patients.invalid')) await sendMail({ to: user.email, subject: title, text: message });
    } catch (err) {
      console.error('[notify] e-mail failed:', err.message);
    }
  };

  if (transaction) transaction.afterCommit(() => void email());
  else void email();

  return notification;
}

module.exports = { notify };
