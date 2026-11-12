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

/**
 * Sends a plain e-mail when SMTP is configured. Without SMTP (local development) the in-app
 * notification is the only channel and the mail is just logged.
 */
async function sendMail({ to, subject, text }) {
  if (!transporter) {
    if (!config.IS_PRODUCTION) console.log(`[mail:dev] to=${to} subject="${subject}"`);
    return;
  }
  await transporter.sendMail({ from: config.SMTP.from, to, subject, text });
}

module.exports = { sendMail, isSmtpConfigured };
