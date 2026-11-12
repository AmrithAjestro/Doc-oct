/**
 * Is a time inside the window in which the doctor is running late?
 * (doctor: a DoctorProfile instance or plain object with runningLateUntil)
 */
function insideLateWindow(doctor, startAt, now = Date.now()) {
  const until = doctor?.runningLateUntil ? new Date(doctor.runningLateUntil).getTime() : 0;
  return until > now && new Date(startAt).getTime() < until;
}

module.exports = { insideLateWindow };
