const config = require('../config/config');

/**
 * HTML e-mail templates. Every mail uses one layout (inline styles and tables, so it renders in
 * Gmail and Outlook) and has a plain-text twin for clients that block HTML.
 */

const THEMES = {
  success: { color: '#16a34a', soft: '#dcfce7', icon: '✅' },
  info: { color: '#2563eb', soft: '#dbeafe', icon: '📅' },
  reminder: { color: '#0891b2', soft: '#cffafe', icon: '⏰' },
  warning: { color: '#d97706', soft: '#fef3c7', icon: '⚠️' },
  danger: { color: '#dc2626', soft: '#fee2e2', icon: '❌' },
  security: { color: '#7c3aed', soft: '#ede9fe', icon: '🔒' },
  welcome: { color: '#0d9488', soft: '#ccfbf1', icon: '👋' },
  star: { color: '#ca8a04', soft: '#fef9c3', icon: '⭐' }
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const url = (path) => `${config.APP_URL}${path}`;

/**
 * @param {object} o
 * @param {string} o.theme     key of THEMES
 * @param {string} o.title     headline
 * @param {string} [o.name]    recipient's first name for the greeting
 * @param {string} o.message   main paragraph (plain text, newlines kept)
 * @param {Array<[string,string]>} [o.details]  label/value rows shown in a box
 * @param {{label:string, href:string}} [o.button]
 * @param {string} [o.note]    small print under the button
 * @param {{appName?:string, supportEmail?:string}} [o.brand]
 */
function layout({ theme = 'info', title, name, message, details = [], button, note, brand = {} }) {
  const t = THEMES[theme] || THEMES.info;
  const app = brand.appName || 'DocBook';
  const support = brand.supportEmail || config.SMTP.from?.match(/<(.+)>/)?.[1] || config.SMTP.user;

  const detailRows = details
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `<tr>
        <td style="padding:6px 0;color:#64748b;font-size:14px;width:40%;vertical-align:top">${esc(k)}</td>
        <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600">${esc(v)}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 16px;font-size:20px;font-weight:700;color:#0f172a">🩺 ${esc(app)}</td></tr>
    <tr><td style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08)">
      <div style="height:6px;background:${t.color}"></div>
      <div style="padding:32px 32px 28px">
        <div style="width:56px;height:56px;border-radius:50%;background:${t.soft};text-align:center;line-height:56px;font-size:26px">${t.icon}</div>
        <h1 style="margin:20px 0 8px;font-size:22px;line-height:1.3;color:#0f172a">${esc(title)}</h1>
        ${name ? `<p style="margin:0 0 12px;font-size:15px;color:#334155">Hi ${esc(name)},</p>` : ''}
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;white-space:pre-line">${esc(message)}</p>
        ${detailRows ? `<table role="presentation" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${t.color};border-radius:8px;padding:10px 16px;margin:0 0 24px">${detailRows}</table>` : ''}
        ${button ? `<a href="${esc(button.href)}" style="display:inline-block;background:${t.color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">${esc(button.label)}</a>` : ''}
        ${note ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#64748b">${esc(note)}</p>` : ''}
      </div>
    </td></tr>
    <tr><td style="padding:20px 8px;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8">
      You received this e-mail because you have an account on ${esc(app)}.<br>
      ${support ? `Questions? Write to <a href="mailto:${esc(support)}" style="color:#64748b">${esc(support)}</a>.<br>` : ''}
      <a href="${esc(url('/notifications'))}" style="color:#64748b">View all notifications</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    title,
    '',
    name ? `Hi ${name},` : null,
    message,
    details.filter(([, v]) => v).length ? '' : null,
    ...details.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    button ? `\n${button.label}: ${button.href}` : null,
    note ? `\n${note}` : null,
    `\n— ${app}`
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { html, text };
}

const firstName = (n) => (n || '').trim().split(/\s+/)[0] || undefined;

/* ---------- Account e-mails ---------- */

const welcomePatient = (user, brand) => ({
  subject: `Welcome to ${brand.appName || 'DocBook'}`,
  ...layout({
    brand,
    theme: 'welcome',
    title: 'Your account is ready',
    name: firstName(user.name),
    message: 'Thanks for signing up. You can now find doctors, book appointments and get reminders before every visit.',
    details: [['Account e-mail', user.email]],
    button: { label: 'Find a doctor', href: url('/doctors') }
  })
});

const welcomeDoctor = (user, profile, brand) => ({
  subject: 'We received your doctor registration',
  ...layout({
    brand,
    theme: 'welcome',
    title: 'Registration received',
    name: `Dr. ${user.name}`,
    message: 'Thanks for registering. Our team is reviewing your medical certificate. We will e-mail you as soon as your profile is approved and patients can book you.',
    details: [
      ['Specialization', profile.specialization],
      ['Status', 'Awaiting review']
    ],
    button: { label: 'Open dashboard', href: url('/dashboard') }
  })
});

const loginAlert = (user, { ip, device }, brand) => ({
  subject: 'New sign-in to your account',
  ...layout({
    brand,
    theme: 'security',
    title: 'New sign-in detected',
    name: firstName(user.name),
    message: 'Your account was just signed in to. If this was you, there is nothing to do.',
    details: [
      ['When', new Date().toLocaleString('en-IN', { timeZone: config.DISPLAY_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' })],
      ['Device', device],
      ['IP address', ip]
    ],
    button: { label: 'Secure my account', href: url('/account') },
    note: "If this wasn't you, change your password now and choose “Sign out everywhere”."
  })
});

const passwordReset = (user, link, minutes, brand) => ({
  subject: 'Reset your password',
  ...layout({
    brand,
    theme: 'security',
    title: 'Reset your password',
    name: firstName(user.name),
    message: `We received a request to reset your password. The button below works once and expires in ${minutes} minutes.`,
    button: { label: 'Choose a new password', href: link },
    note: "If you didn't ask for this, ignore this e-mail. Your password stays the same."
  })
});

const passwordChanged = (user, brand) => ({
  subject: 'Your password was changed',
  ...layout({
    brand,
    theme: 'security',
    title: 'Password changed',
    name: firstName(user.name),
    message: 'Your password was just changed and you were signed out on your other devices.',
    button: { label: 'Go to my account', href: url('/account') },
    note: "If you didn't do this, reset your password right away from the sign-in page, and contact support."
  })
});

/* ---------- Notification e-mails (one per notification type) ---------- */

const THEME_BY_TYPE = {
  booking_created: 'success',
  booking_confirmed: 'success',
  booking_completed: 'success',
  walk_in_recorded: 'success',
  doctor_approved: 'success',
  booking_rescheduled: 'info',
  booking_auto_rescheduled: 'info',
  doctor_moved: 'info',
  doctor_registered: 'info',
  waitlist_opening: 'info',
  doctor_delayed: 'warning',
  booking_no_show: 'warning',
  booking_cancelled: 'danger',
  doctor_rejected: 'danger',
  doctor_suspended: 'danger',
  review_added: 'star'
};

function buttonFor(type, appointmentId) {
  if (type === 'follow_up_scheduled') return { label: 'View visit & book follow-up', href: url(`/appointments/${appointmentId}`) };
  if (type === 'waitlist_opening') return { label: 'Book this slot', href: url('/doctors') };
  if (type === 'doctor_registered') return { label: 'Review doctor', href: url('/admin/doctors') };
  if (type === 'booking_completed') return { label: 'View prescription & rate visit', href: url(`/appointments/${appointmentId}`) };
  if (type === 'booking_auto_rescheduled' || type === 'doctor_moved') return { label: 'Accept or change time', href: url(`/appointments/${appointmentId}`) };
  if (appointmentId) return { label: 'View appointment', href: url(`/appointments/${appointmentId}`) };
  if (type.startsWith('doctor_')) return { label: 'Open dashboard', href: url('/dashboard') };
  return { label: 'Open notifications', href: url('/notifications') };
}

const NOTES = {
  booking_cancelled: 'Need another time? You can book a new appointment any time.',
  booking_no_show: 'If you think this is a mistake, please contact the clinic.',
  doctor_delayed: 'We are sorry for the wait. Your place in the queue is kept.',
  waitlist_opening: 'Slots are given to whoever books first, so be quick.'
};

/** Builds the e-mail for an in-app notification. */
function notificationEmail({ type, title, message, appointmentId }, user, brand) {
  const theme = THEME_BY_TYPE[type] || (type.startsWith('reminder_') ? 'reminder' : 'info');
  return {
    subject: title,
    ...layout({
      brand,
      theme,
      title,
      name: user.role === 'doctor' ? `Dr. ${user.name}` : firstName(user.name),
      message,
      button: buttonFor(type, appointmentId),
      note: NOTES[type]
    })
  };
}

module.exports = { layout, welcomePatient, welcomeDoctor, loginAlert, passwordReset, passwordChanged, notificationEmail };
