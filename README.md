# Doctor Appointment System

An online clinic booking app with three roles:

- **Patient**: find doctors, book a slot, confirm or reschedule, get reminders, see prescriptions and leave reviews.
- **Doctor**: register with a certificate, publish available slots, manage visits and walk-ins, and write prescriptions.
- **Admin**: approve doctors, manage users, and set the branding and platform commission.

**Tech:** React + Vite + Tailwind (frontend) · Node.js + Express + Sequelize + PostgreSQL (backend)

## Run locally

**Windows:** double-click `start.bat`. It installs everything, sets up the database and opens the app.
`stop.bat` stops it.

**Any OS** (needs PostgreSQL 13+):

```bash
cd server
cp .env.example .env     # set JWT_SECRET, and DB_* if needed
npm install
npm run db:setup         # creates the database, tables and demo data
npm run dev              # API on http://localhost:5000

cd ../client
npm install
npm run dev              # app on http://localhost:5173
```

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Patient | `demo@gmail.com` | `Password@123` |
| Doctor | `doc@gmail.com` | `Password@1234` |

The login page has one-click buttons for these accounts.

## Deploy on Railway

Create one project with three services:

1. **Postgres**: **+ Create → Database → PostgreSQL**.
2. **Backend**: **+ Create → GitHub Repo**, then set:
   - Root Directory: `/server`
   - Start Command: `npm run db:init && npm start`
   - Healthcheck Path: `/api/health`
   - Variables:
     ```
     NODE_ENV=production
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     ALLOWED_ORIGINS=https://<frontend-domain>
     APP_URL=https://<frontend-domain>
     JWT_SECRET=<long random string>
     ADMIN_EMAIL=<admin email>
     ADMIN_PASSWORD=<admin password>
     ```
3. **Frontend**: **+ Create → GitHub Repo** again, then set:
   - Root Directory: `/client`
   - Build Command: `npm run build`
   - Start Command: `npm start`
   - Variable: `VITE_API_URL=https://<backend-domain>`

Click **Generate Domain** on both the backend and the frontend. Every push to `main` redeploys them.
Use `npm run db:setup` instead of `db:init` in the start command if you also want the demo data.
To send emails, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` to the backend.
Every backend option is explained in `server/.env.example`.

## Useful scripts (in `server/`)

| Command | What it does |
|---|---|
| `npm run db:init` | Creates any missing tables, plus the admin account. Safe to run on every deploy. |
| `npm run db:setup` | Runs `db:init` and adds the demo data. |
| `npm run db:reset` | Deletes all data and starts fresh. Local only. |
| `npm test` | Runs the booking rule tests. |

## Key rules

- A slot can never be booked twice: this is enforced both in code and in the database.
- Patients can't cancel or reschedule within 24 hours of the visit.
- Unconfirmed bookings are automatically moved to the doctor's next free slot.
- Reminders are sent 1 day, 1 hour and 15 minutes before a visit.
- The price is the doctor's fee plus the platform commission. It is fixed at the moment of booking.

## Project structure

```
client/src     pages, components, API client
server/src     routes → controllers → services → models
server/database/schema.sql   the full database schema
```
