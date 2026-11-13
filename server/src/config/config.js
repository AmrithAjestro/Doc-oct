const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET && isProduction) {
  throw new Error('JWT_SECRET must be set in production');
}

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: isProduction,
  PORT: num(process.env.PORT, 5000),
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // On Railway, mount a Volume and point UPLOAD_DIR at it so uploads survive redeploys.
  UPLOAD_DIR: process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(__dirname, '../../uploads'),

  // Where the React app runs; used to build links in e-mails (password reset).
  APP_URL: (process.env.APP_URL || (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, ''),
  RESET_TOKEN_MINUTES: 30,

  // Notification texts show times in this zone (the server cannot know each reader's zone).
  DISPLAY_TIMEZONE: process.env.DISPLAY_TIMEZONE || 'Asia/Kolkata',

  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED !== 'false',

  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || ''
  },

  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'amrithamrith2753@gmail.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@1234',

  /**
   * Booking rules. Kept in one place so the API, the scheduler and the
   * "what can I do with this appointment" flags sent to the UI never disagree.
   */
  RULES: {
    // No cancel / reschedule by the patient inside this window before the start.
    LOCK_WINDOW_HOURS: num(process.env.LOCK_WINDOW_HOURS, 24),
    // A pending appointment gets a "please confirm" nudge this long before its confirmation deadline.
    CONFIRM_NUDGE_HOURS: 12,
    // When the system moves an unconfirmed appointment, the new slot must start at least this far
    // ahead, so the patient always has a full day to confirm the new time.
    AUTO_RESCHEDULE_MIN_LEAD_HOURS: 48,
    // After this many automatic moves without confirmation the appointment is cancelled.
    MAX_AUTO_RESCHEDULES: 2,
    MIN_SLOT_MINUTES: 10,
    MAX_SLOT_MINUTES: 240,
    MAX_SLOTS_PER_REQUEST: 300,
    MAX_SLOT_RANGE_DAYS: 90
  }
};

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set — using an insecure development secret.');
}

module.exports = config;
