const nodemailer = require('nodemailer');
const config = require('../config/config');

const isSmtpConfigured = Boolean(config.SMTP.host && config.SMTP.user && config.SMTP.pass);

const transporter = isSmtpConfigured
  ? nodemailer.createTransport({
      host: config.SMTP.host,
      port: config.SMTP.port,
      secure: config.SMTP.secure,
      auth: { user: config.SMTP.user, pass: config.SMTP.pass }
    })
  : null;

/** App name and support address from the admin settings, used in every e-mail's header and footer. */
async function getBrand() {
  try {
    const { Setting } = require('../models');
    const s = await Setting.findByPk(1, { attributes: ['appName', 'supportEmail'] });
    return { appName: s?.appName, supportEmail: s?.supportEmail };
  } catch {
    return {};
  }
}

/**
 * Sends an e-mail (HTML with a plain-text twin) when SMTP is configured. Without SMTP (local
 * development) the in-app notification is the only channel and the mail is just logged.
 */
async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    if (!config.IS_PRODUCTION) console.log(`[mail:dev] to=${to} subject="${subject}"`);
    return;
  }
  const { appName } = await getBrand();
  const from = appName && config.SMTP.user && !config.SMTP.from.includes('<') ? `"${appName}" <${config.SMTP.from}>` : config.SMTP.from;
  await transporter.sendMail({ from, to, subject, text, html });
}

/** Fire-and-forget: e-mail problems are logged and never break the request. */
const sendMailSafe = (mail, label = 'mail') =>
  sendMail(mail).catch((err) => console.error(`[${label}] e-mail failed:`, err.message));

module.exports = { sendMail, sendMailSafe, getBrand, isSmtpConfigured };
