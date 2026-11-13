
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() (built in on PG13+, harmless otherwise)

-- ---------- Enum types ----------
CREATE TYPE enum_users_role                 AS ENUM ('user', 'doctor', 'admin');
CREATE TYPE enum_doctor_profiles_status     AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE enum_slots_status               AS ENUM ('available', 'booked', 'blocked');
CREATE TYPE enum_appointments_status        AS ENUM ('pending_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE enum_appointments_visit_type    AS ENUM ('booked', 'walk_in');
CREATE TYPE enum_reminders_type             AS ENUM ('confirm', 'day', 'hour', 'quarter');
CREATE TYPE enum_reminders_status           AS ENUM ('pending', 'sent', 'skipped');
CREATE TYPE enum_settings_commission_type   AS ENUM ('percentage', 'flat');

-- ---------- users ----------
CREATE TABLE users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(120) NOT NULL,
  email                   VARCHAR(160) NOT NULL UNIQUE,
  phone                   VARCHAR(20),
  password_hash           VARCHAR(255) NOT NULL,
  role                    enum_users_role NOT NULL DEFAULT 'user',
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  token_version           INTEGER NOT NULL DEFAULT 0,
  reset_token_hash        VARCHAR(64),
  reset_token_expires_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX users_role ON users (role);

-- ---------- doctor_profiles ----------
CREATE TABLE doctor_profiles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL UNIQUE REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  specialization         VARCHAR(120) NOT NULL,
  qualification          VARCHAR(200),
  experience_years       INTEGER NOT NULL DEFAULT 0,
  fee                    DECIMAL(10,2) NOT NULL DEFAULT 0,
  bio                    TEXT,
  clinic_address         VARCHAR(255),
  certificate_path       VARCHAR(255),
  certificate_name       VARCHAR(255),
  certificate_mime_type  VARCHAR(80),
  status                 enum_doctor_profiles_status NOT NULL DEFAULT 'pending',
  rejection_reason       TEXT,
  reviewed_at            TIMESTAMPTZ,
  reviewed_by            UUID REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  photo_path             VARCHAR(255),
  languages              VARCHAR(200),
  clinic_hours           VARCHAR(200),
  running_late_minutes   INTEGER,
  running_late_until     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doctor_fee_non_negative CHECK (fee >= 0)
);
CREATE INDEX doctor_profiles_status ON doctor_profiles (status);
CREATE INDEX doctor_profiles_specialization ON doctor_profiles (specialization);

-- ---------- slots ----------
CREATE TABLE slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES doctor_profiles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  status      enum_slots_status NOT NULL DEFAULT 'available',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT slot_end_after_start CHECK (end_at > start_at)
);
CREATE UNIQUE INDEX slots_doctor_id_start_at ON slots (doctor_id, start_at);
CREATE INDEX slots_status_start_at ON slots (status, start_at);

-- ---------- appointments ----------
CREATE TABLE appointments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  doctor_id               UUID NOT NULL REFERENCES doctor_profiles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  slot_id                 UUID REFERENCES slots (id) ON UPDATE CASCADE ON DELETE SET NULL,
  start_at                TIMESTAMPTZ NOT NULL,
  end_at                  TIMESTAMPTZ NOT NULL,
  status                  enum_appointments_status NOT NULL DEFAULT 'pending_confirmation',
  reason                  TEXT,
  doctor_fee              DECIMAL(10,2) NOT NULL,
  commission              DECIMAL(10,2) NOT NULL,
  total_fee               DECIMAL(10,2) NOT NULL,
  confirmed_at            TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancelled_by            VARCHAR(20),
  cancel_reason           TEXT,
  reschedule_count        INTEGER NOT NULL DEFAULT 0,
  auto_reschedule_count   INTEGER NOT NULL DEFAULT 0,
  previous_start_at       TIMESTAMPTZ,
  doctor_notes            TEXT,
  visit_type              enum_appointments_visit_type NOT NULL DEFAULT 'booked',
  is_emergency            BOOLEAN NOT NULL DEFAULT FALSE,
  awaiting_patient_reply  BOOLEAN NOT NULL DEFAULT FALSE,
  doctor_move_reason      TEXT,
  delay_notified_at       TIMESTAMPTZ,
  delay_minutes           INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX appointments_user_id_start_at ON appointments (user_id, start_at);
CREATE INDEX appointments_doctor_id_start_at ON appointments (doctor_id, start_at);
CREATE INDEX appointments_status_start_at ON appointments (status, start_at);
-- One live appointment per slot (prevents double booking)
CREATE UNIQUE INDEX appointments_one_active_per_slot ON appointments (slot_id)
  WHERE status IN ('pending_confirmation', 'confirmed');

-- ---------- prescriptions ----------
CREATE TABLE prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID NOT NULL UNIQUE REFERENCES appointments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  diagnosis       TEXT,
  medicines       JSONB NOT NULL DEFAULT '[]'::jsonb,
  advice          TEXT,
  follow_up_date  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- notifications ----------
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  appointment_id  UUID REFERENCES appointments (id) ON UPDATE CASCADE ON DELETE SET NULL,
  type            VARCHAR(40) NOT NULL,
  title           VARCHAR(160) NOT NULL,
  message         TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_user_id_created_at ON notifications (user_id, created_at);
CREATE INDEX notifications_user_id_read_at ON notifications (user_id, read_at);

-- ---------- reminders ----------
CREATE TABLE reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID NOT NULL REFERENCES appointments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  type            enum_reminders_type NOT NULL,
  send_at         TIMESTAMPTZ NOT NULL,
  status          enum_reminders_status NOT NULL DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX reminders_status_send_at ON reminders (status, send_at);
CREATE INDEX reminders_appointment_id ON reminders (appointment_id);

-- ---------- settings (single row) ----------
CREATE TABLE settings (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  app_name          VARCHAR(60) NOT NULL DEFAULT 'DocBook',
  tagline           VARCHAR(160),
  logo_path         VARCHAR(255),
  commission_type   enum_settings_commission_type NOT NULL DEFAULT 'percentage',
  commission_value  DECIMAL(10,2) NOT NULL DEFAULT 10,
  currency          VARCHAR(3) NOT NULL DEFAULT 'INR',
  support_email     VARCHAR(160),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settings_single_row CHECK (id = 1),
  CONSTRAINT settings_commission_non_negative CHECK (commission_value >= 0)
);

-- ---------- reviews ----------
CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID NOT NULL UNIQUE REFERENCES appointments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  doctor_id       UUID NOT NULL REFERENCES doctor_profiles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  rating          INTEGER NOT NULL,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT review_rating_range CHECK (rating BETWEEN 1 AND 5)
);
CREATE INDEX reviews_doctor_id_created_at ON reviews (doctor_id, created_at);

-- ---------- waitlist_entries ----------
CREATE TABLE waitlist_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  doctor_id         UUID NOT NULL REFERENCES doctor_profiles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  preferred_date    DATE,
  last_notified_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX waitlist_entries_user_id_doctor_id ON waitlist_entries (user_id, doctor_id);
CREATE INDEX waitlist_entries_doctor_id_created_at ON waitlist_entries (doctor_id, created_at);

-- ---------- Mark migrations as applied (so sequelize-cli won't re-run them) ----------
CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name VARCHAR(255) PRIMARY KEY);
INSERT INTO "SequelizeMeta" (name) VALUES
  ('20261111000001-create-schema.js'),
  ('20261112000001-reviews-reset-profile.js'),
  ('20261112000002-walk-in-visits.js'),
  ('20261112000003-doctor-moved-visits.js'),
  ('20261112000004-waitlist.js'),
  ('20261112000005-delay-notice.js'),
  ('20261112000006-doctor-running-late.js')
ON CONFLICT DO NOTHING;

COMMIT;
