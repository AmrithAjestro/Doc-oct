const cron = require('node-cron');
const appointmentService = require('../services/appointment.service');
const reminderService = require('../services/reminder.service');

let running = false;

/**
 * Runs every minute. Order matters: unconfirmed appointments are moved first, so reminders that
 * follow are for the new time. Safe to run on several instances (row locks with SKIP LOCKED).
 */
async function tick() {
  if (running) return; // a slow run is never overlapped by the next one
  running = true;
  try {
    const moved = await appointmentService.processUnconfirmed();
    const sent = await reminderService.processDue();
    if (moved || sent) console.log(`[scheduler] unconfirmed handled: ${moved}, reminders processed: ${sent}`);
  } catch (err) {
    console.error('[scheduler] run failed:', err);
  } finally {
    running = false;
  }
}

function start() {
  cron.schedule('* * * * *', tick);
  setTimeout(tick, 2000); // catch up on anything missed while the server was down
  console.log('⏰ Scheduler started (reminders + unconfirmed appointments, every minute)');
}

module.exports = { start, tick };
