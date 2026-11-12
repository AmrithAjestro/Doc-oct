# Doctor Appointment System

A full-stack booking platform with three roles — **Patient**, **Doctor** and **Admin**.

- **Frontend:** React 18 · Vite · React Router · Tailwind CSS · framer-motion · lucide-react
- **Backend:** Node.js · Express · Sequelize · PostgreSQL · Multer (uploads) · node-cron (reminders) · Zod (validation) · JWT

---

## Quick start (Windows)

Double-click **`start.bat`**. It:

1. starts PostgreSQL (a portable install in `%USERPROFILE%\pgsql`, or uses your own server on `127.0.0.1:5432`),
2. on first run installs packages, creates `server/.env` with a random JWT secret, and creates + migrates + seeds the database,
3. opens the API (`http://localhost:5000/api`) and the app (`http://localhost:5173`) in their own windows and launches the browser.

`stop-db.bat` stops the portable PostgreSQL.

### Manual setup (any OS)

```bash
# PostgreSQL 13+ running locally; defaults: postgres / postgres @ 127.0.0.1:5432
cd server
cp .env.example .env            # set JWT_SECRET (and DB_* if different)
npm install
npm run db:setup                # create DB, run migrations, seed admin + demo data
npm run dev                     # API on :5000

cd ../client
npm install
npm run dev                     # app on :5173 (proxies /api and /uploads to :5000)
```

### Demo accounts (`npm run db:seed:demo`)

| Role | Email | Password |
|---|---|---|
| Patient | `patient@demo.local` | `Demo@1234` |
| Doctor (approved) | `ananya.rao@demo.local` · `rahul.menon@demo.local` · `fatima.sheikh@demo.local` | `Demo@1234` |
| Doctor (awaiting approval) | `vikram.iyer@demo.local` | `Demo@1234` |
| Admin | `admin@docbook.local` | `Admin@1234` |

The login page has one-click buttons for these.

### Tests

With the API running: `cd server && npm run test:e2e` — 17 end-to-end checks against the real API and database
(registration with upload, approval, slot overlap, a **concurrent double-booking race**, the 24-hour lock, rescheduling,
the automatic move of unconfirmed bookings, completion and prescriptions, role isolation). The script cleans up after itself.

---

## Features by role

**Patient** — register · browse/search doctors by specialization · see the fee breakdown (doctor fee + platform fee) ·
book a free slot · confirm attendance · "I can't make it" → move to the next free slot · cancel · view prescriptions ·
notifications · dashboard.

**Doctor** — register with a certificate (PDF/JPG/PNG) · wait for approval (re-upload if rejected) · edit profile and fee ·
publish availability with a bulk slot generator (date range, weekdays, hours, slot length, breaks) · delete/reopen slots ·
see appointments · complete / mark no-show · write prescriptions · dashboard with today's schedule and earnings.

**Admin** — review the doctor queue with an inline certificate preview · approve / reject / revoke · activate/deactivate users ·
see all appointments · configure app name, tagline, logo, commission (percentage or flat) and currency · dashboard with
counts, status breakdown and commission earned.

---

## Business rules

| Rule | Implementation |
|---|---|
| **No double booking** | Booking runs in one transaction that locks the slot row (`SELECT … FOR UPDATE`). A partial unique index `appointments(slot_id) WHERE status IN ('pending_confirmation','confirmed')` guarantees it at the database level even if application code is bypassed. A patient can't hold two overlapping appointments (per-patient advisory lock + overlap check). Doctors can't create overlapping slots (per-doctor advisory lock; overlaps are skipped and reported). |
| **Fee = doctor fee + commission** | Calculated only on the server (`utils/fees.js`). The three amounts are **snapshotted onto the appointment** at booking, so later fee or commission changes never alter existing bookings. |
| **No cancel / reschedule within 24 h** | Enforced by the API (`422 LOCK_WINDOW`). The API also returns an `actions` object per appointment (what the viewer may do now), so the UI never re-implements the rule. |
| **Confirmation & auto-reschedule** | A booking made more than 24 h ahead starts as *awaiting confirmation*; the patient must confirm before *start − 24 h*. A booking made inside 24 h is confirmed immediately (and the UI warns it cannot be changed). If the deadline passes unconfirmed, the scheduler **moves it to the doctor's next free slot** (at least 48 h ahead, so the patient gets a full day to confirm the new time) and notifies both sides. After 2 automatic moves, or with no slot left, it is cancelled and the slot released. |
| **"I can't make it"** | The patient previews the doctor's next free slot and confirms the move; the old slot is released in the same transaction. If someone takes the slot meanwhile, the UI fetches the next one. |
| **Notifications** | In-app (and e-mail when SMTP is configured): booking created, "please confirm" nudge, reminders **1 day, 1 hour and 15 minutes** before, confirmation, reschedule, cancellation, completion, prescription, approval/rejection. |

### Reminders

Reminders are rows in a `reminders` table created at booking time (only those still in the future — a booking 5 h ahead
gets no 1-day reminder). A `node-cron` job runs every minute: it first processes unconfirmed appointments, then sends due
reminders. Rows are claimed with `FOR UPDATE SKIP LOCKED`, so a restart never re-sends and several API instances never
send the same reminder twice. Reminders are reset whenever an appointment moves and dropped when it is cancelled or completed;
a reminder whose appointment is no longer valid is marked `skipped` rather than sent.

---

## Other edge cases handled

- Doctors can sign in while pending, but cannot publish slots, appear in search or receive bookings until approved.
- Revoking a doctor or deactivating any user cancels their future appointments and notifies the other party.
- A doctor who cancels gives a reason; the slot is **blocked** (not reopened) because they are unavailable — it can be reopened later.
- Completion, no-show and prescriptions are only possible once the appointment has started, and only by its own doctor.
- Users only ever see their own appointments (others return 404, not 403, so ids can't be probed).
- Uploads: allow-listed MIME types **and** file signature check, size limits, random file names; files of failed requests are deleted.
  Certificates are never served statically — only through an authorised route (admin or the owning doctor). SVG logos are refused (script risk).
- A doctor's private notes are never sent to the patient.
- Times are stored as `timestamptz` (UTC) and shown in the viewer's local time zone; slots are generated in the doctor's browser time zone.
- Login: same response time for unknown e-mails and wrong passwords; rate-limited auth routes; deactivated accounts are rejected on every request (the user is loaded fresh per request, not trusted from the token).
- Consistent error format `{ success: false, code, message, details }`; 5xx details stay in the server log.

---

## Database

```
users ─1:1─ doctor_profiles ─1:n─ slots
  │                │                 │
  │ 1:n            │ 1:n             │ 1:n (history)
  └──────────── appointments ────────┘
                   │ 1:1 prescriptions
                   │ 1:n reminders
users ─1:n─ notifications (optional appointment link)
settings (single row: branding + commission)
```

All tables use UUID keys and are created by a Sequelize migration (`server/src/migrations`), including CHECK constraints
(`end_at > start_at`, non-negative fees, single settings row) and the partial unique index above.

## API overview (`/api`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/register/doctor` (multipart) · `POST /auth/login` · `GET/PATCH /auth/me` · `POST /auth/change-password` |
| Public | `GET /settings/public` · `GET /doctors` · `GET /doctors/specializations` · `GET /doctors/:id` · `GET /doctors/:id/slots` |
| Doctor | `GET/PATCH /doctor/profile` · `PUT /doctor/profile/certificate` · `GET/POST /doctor/slots` · `DELETE /doctor/slots/:id` · `POST /doctor/slots/:id/unblock` |
| Appointments | `GET /appointments` (role-scoped) · `POST /appointments` · `GET /appointments/:id` · `POST …/confirm` · `GET …/reschedule-preview` · `POST …/reschedule` · `POST …/cancel` · `POST …/complete` · `POST …/no-show` · `PUT …/prescription` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all` |
| Dashboards | `GET /dashboard` (role-specific) |
| Admin | `GET /admin/doctors` · `GET /admin/doctors/:id` · `PATCH /admin/doctors/:id/status` · `GET /doctors/:id/certificate` · `GET /admin/users` · `PATCH /admin/users/:id/status` · `GET/PUT /admin/settings` · `PUT/DELETE /admin/settings/logo` |

## Project structure

```
server/src
  config/        env config, DB config, constants (statuses, rules)
  models/        Sequelize models + associations
  migrations/    schema, constraints, indexes
  middlewares/   auth (JWT + roles), validation (zod), uploads, errors
  validators/    request schemas
  services/      business logic — appointment, doctor, admin, reminder, notification, …
  controllers/   thin HTTP handlers
  routes/        route table
  jobs/          scheduler (reminders + unconfirmed appointments)
  scripts/       seed, end-to-end test
client/src
  lib/           UI kit, API client, formatting, validation, hooks
  context/       auth + branding
  components/    app shell, sidebar, appointment actions, prescription, shared bits
  pages/         auth, patient, doctor, admin and shared pages
```
