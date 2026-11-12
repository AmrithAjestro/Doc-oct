const { z } = require('zod');
const { APPOINTMENT_STATUS, DOCTOR_STATUS, COMMISSION_TYPES, ROLES } = require('../config/constants');

const trimmed = (max) => z.string().trim().max(max);
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v));

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal('').transform(() => undefined));
const name = trimmed(120).min(2, 'Name is too short');
const uuid = z.string().uuid('Invalid id');
const isoDate = z.coerce.date({ invalid_type_error: 'Invalid date' });
// Multipart fields arrive as strings, so numbers are coerced.
const money = z.coerce.number().min(0, 'Must be 0 or more').max(1000000, 'Too large');

const idParam = z.object({ id: uuid });
const pagination = { page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() };

const doctorProfileFields = {
  specialization: trimmed(120).min(2, 'Specialization is required'),
  qualification: optionalText(200),
  experienceYears: z.coerce.number().int().min(0).max(70).default(0),
  fee: money,
  bio: optionalText(2000),
  clinicAddress: optionalText(255)
};

const medicine = z.object({
  name: trimmed(120).min(1, 'Medicine name is required'),
  dosage: optionalText(60),
  frequency: optionalText(60),
  duration: optionalText(60),
  instructions: optionalText(200)
});

module.exports = {
  idParam,

  auth: {
    registerUser: z.object({ name, email, phone, password }),
    registerDoctor: z.object({ name, email, phone, password, ...doctorProfileFields }),
    login: z.object({ email, password: z.string().min(1, 'Password is required') }),
    updateMe: z.object({ name: name.optional(), phone }),
    changePassword: z.object({ currentPassword: z.string().min(1), newPassword: password })
  },

  doctor: {
    publicList: z.object({ search: trimmed(80).optional(), specialization: trimmed(120).optional(), ...pagination }),
    range: z.object({ from: isoDate.optional(), to: isoDate.optional() }),
    updateProfile: z
      .object({ name: name.optional(), phone, ...doctorProfileFields })
      .partial()
      .refine((v) => Object.keys(v).length > 0, 'Nothing to update'),
    createSlots: z.object({
      slots: z
        .array(z.object({ startAt: isoDate, endAt: isoDate }))
        .min(1, 'Add at least one slot')
        .max(300, 'At most 300 slots at a time')
    })
  },

  appointment: {
    list: z.object({
      status: z.enum(Object.values(APPOINTMENT_STATUS)).optional(),
      scope: z.enum(['upcoming', 'past', 'all']).optional(),
      search: trimmed(80).optional(),
      doctorId: uuid.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      ...pagination
    }),
    book: z.object({ slotId: uuid, reason: optionalText(500) }),
    reschedule: z.object({ slotId: uuid }),
    cancel: z.object({ reason: optionalText(300) }),
    complete: z.object({ notes: optionalText(2000) }),
    prescription: z.object({
      diagnosis: optionalText(1000),
      medicines: z.array(medicine).max(30).default([]),
      advice: optionalText(2000),
      followUpDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
        .optional()
        .nullable()
        .or(z.literal('').transform(() => null))
    }).refine((v) => v.diagnosis || v.medicines.length || v.advice, 'Add a diagnosis, a medicine or advice')
  },

  notification: { list: z.object({ unread: z.enum(['true', 'false']).optional(), ...pagination }) },

  admin: {
    doctors: z.object({ status: z.enum(Object.values(DOCTOR_STATUS)).optional(), search: trimmed(80).optional(), ...pagination }),
    reviewDoctor: z.object({ status: z.enum([DOCTOR_STATUS.APPROVED, DOCTOR_STATUS.REJECTED]), reason: optionalText(500) }),
    users: z.object({
      role: z.enum(Object.values(ROLES)).optional(),
      status: z.enum(['active', 'inactive']).optional(),
      search: trimmed(80).optional(),
      ...pagination
    }),
    userStatus: z.object({ isActive: z.boolean() }),
    settings: z
      .object({
        appName: trimmed(60).min(2),
        tagline: optionalText(160),
        commissionType: z.enum(Object.values(COMMISSION_TYPES)),
        commissionValue: z.coerce.number().min(0).max(100000),
        currency: z.string().trim().toUpperCase().length(3, 'Use a 3-letter currency code'),
        supportEmail: email.optional().nullable().or(z.literal('').transform(() => null))
      })
      .partial()
      .refine((v) => v.commissionType !== COMMISSION_TYPES.PERCENTAGE || v.commissionValue === undefined || v.commissionValue <= 100, {
        message: 'A percentage commission cannot exceed 100',
        path: ['commissionValue']
      })
  }
};
