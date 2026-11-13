/**
 * Seeds the admin account and default settings (always), plus demo doctors, a patient,
 * availability and one finished appointment with a prescription (with --demo).
 * Safe to run more than once: existing records are left alone.
 *
 *   npm run db:seed          admin + settings
 *   npm run db:seed:demo     + demo data
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const { ROLES, DOCTOR_STATUS, APPOINTMENT_STATUS } = require('../config/constants');
const { sequelize, User, DoctorProfile, Slot, Appointment, Prescription } = require('../models');
const { getSettings } = require('../services/settings.service');
const { calculateFee } = require('../utils/helpers');
const { MINUTE, DAY } = require('../utils/helpers');

const DEMO_PASSWORD = 'Demo@1234';

const DOCTORS = [
  { name: 'Ananya Rao', email: 'doc@gmail.com', password: 'Password@1234', specialization: 'Cardiology', qualification: 'MBBS, MD (Cardiology)', experienceYears: 12, fee: 800, bio: 'Interventional cardiologist focused on preventive heart care.', clinicAddress: 'Heart Care Clinic, MG Road' },
  { name: 'Rahul Menon', email: 'rahul.menon@demo.local', specialization: 'Dermatology', qualification: 'MBBS, DVL', experienceYears: 7, fee: 600, bio: 'Skin, hair and nail specialist.', clinicAddress: 'SkinFirst, Indiranagar' },
  { name: 'Fatima Sheikh', email: 'fatima.sheikh@demo.local', specialization: 'Pediatrics', qualification: 'MBBS, DCH', experienceYears: 9, fee: 500, bio: 'Child health, vaccinations and growth monitoring.', clinicAddress: 'Little Steps Clinic, Koramangala' },
  { name: 'Vikram Iyer', email: 'vikram.iyer@demo.local', specialization: 'Orthopedics', qualification: 'MBBS, MS (Ortho)', experienceYears: 4, fee: 700, status: DOCTOR_STATUS.PENDING }
];

function demoCertificate() {
  const dir = path.join(config.UPLOAD_DIR, 'certificates');
  fs.mkdirSync(dir, { recursive: true });
  const file = 'demo-certificate.pdf';
  const pdf =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 40 100 Td (Demo Medical Registration Certificate) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  fs.writeFileSync(path.join(dir, file), pdf);
  return file;
}

/** 30-minute slots, 10:00–13:00 and 16:00–18:00 local time, for the next `days` days. */
function slotTimes(days) {
  const out = [];
  for (let d = 1; d <= days; d += 1) {
    const day = new Date(Date.now() + d * DAY);
    if (day.getDay() === 0) continue; // Sundays off
    for (const [from, to] of [[10, 13], [16, 18]]) {
      for (let m = from * 60; m < to * 60; m += 30) {
        const start = new Date(day);
        start.setHours(Math.floor(m / 60), m % 60, 0, 0);
        out.push({ startAt: start, endAt: new Date(start.getTime() + 30 * MINUTE) });
      }
    }
  }
  return out;
}

async function ensureUser({ name, email, role, phone }, password) {
  const [user, created] = await User.findOrCreate({
    where: { email },
    defaults: { name, email, role, phone, passwordHash: await bcrypt.hash(password, 10) }
  });
  return { user, created };
}

async function seedDemo() {
  const settings = await getSettings();
  const certificate = demoCertificate();
  const { user: patient } = await ensureUser({ name: 'Priya Sharma', email: 'demo@gmail.com', role: ROLES.USER, phone: '+91 98765 43210' }, 'Password@123');

  for (const [index, d] of DOCTORS.entries()) {
    const { user, created } = await ensureUser({ name: d.name, email: d.email, role: ROLES.DOCTOR }, d.password || DEMO_PASSWORD);
    if (!created) continue;
    const status = d.status || DOCTOR_STATUS.APPROVED;
    const profile = await DoctorProfile.create({
      userId: user.id,
      specialization: d.specialization,
      qualification: d.qualification,
      experienceYears: d.experienceYears,
      fee: d.fee,
      bio: d.bio,
      clinicAddress: d.clinicAddress,
      certificatePath: certificate,
      certificateName: 'registration-certificate.pdf',
      certificateMimeType: 'application/pdf',
      status,
      reviewedAt: status === DOCTOR_STATUS.APPROVED ? new Date() : null
    });
    if (status !== DOCTOR_STATUS.APPROVED) continue;

    await Slot.bulkCreate(slotTimes(10).map((s) => ({ ...s, doctorId: profile.id })));

    // One finished visit with a prescription, so every screen has something to show.
    if (index === 0) {
      const start = new Date(Date.now() - 3 * DAY);
      start.setHours(11, 0, 0, 0);
      const slot = await Slot.create({ doctorId: profile.id, startAt: start, endAt: new Date(start.getTime() + 30 * MINUTE), status: 'booked' });
      const appt = await Appointment.create({
        userId: patient.id,
        doctorId: profile.id,
        slotId: slot.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
        status: APPOINTMENT_STATUS.COMPLETED,
        reason: 'Occasional chest tightness after exercise',
        confirmedAt: new Date(start.getTime() - 2 * DAY),
        completedAt: new Date(start.getTime() + 30 * MINUTE),
        ...calculateFee(profile.fee, settings)
      });
      await Prescription.create({
        appointmentId: appt.id,
        diagnosis: 'Mild exercise-induced angina — ECG normal at rest',
        medicines: [
          { name: 'Aspirin', dosage: '75 mg', frequency: 'Once daily after lunch', duration: '30 days' },
          { name: 'Atorvastatin', dosage: '10 mg', frequency: 'Once daily at night', duration: '30 days' }
        ],
        advice: 'Walk 30 minutes daily at a comfortable pace. Avoid heavy exertion until review.',
        followUpDate: new Date(Date.now() + 27 * DAY).toISOString().slice(0, 10)
      });
    }
  }
  console.log(`✅ Demo data ready. Password for every demo account: ${DEMO_PASSWORD}`);
  console.log('   Patient: demo@gmail.com (Password@123)   Doctors: doc@gmail.com (Password@1234), rahul.menon@demo.local, fatima.sheikh@demo.local');
  console.log('   Pending doctor (to approve as admin): vikram.iyer@demo.local');
}

async function main() {
  await sequelize.authenticate();
  await getSettings();
  const { created } = await ensureUser({ name: 'Platform Admin', email: config.ADMIN_EMAIL, role: ROLES.ADMIN }, config.ADMIN_PASSWORD);
  console.log(created ? `✅ Admin created: ${config.ADMIN_EMAIL} / ${config.ADMIN_PASSWORD}` : `ℹ️  Admin already exists: ${config.ADMIN_EMAIL}`);
  if (process.argv.includes('--demo')) await seedDemo();
  await sequelize.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
