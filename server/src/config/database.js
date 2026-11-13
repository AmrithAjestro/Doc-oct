// Used by both the app (models/index.js) and sequelize-cli (.sequelizerc).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// DATABASE_URL (e.g. Railway's) wins over the individual DB_* variables.
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;

const base = {
  username: url ? decodeURIComponent(url.username) : process.env.DB_USER || 'postgres',
  password: url ? decodeURIComponent(url.password) : process.env.DB_PASSWORD || 'postgres',
  database: url ? url.pathname.slice(1) : process.env.DB_NAME || 'doctor_appointments',
  host: url ? url.hostname : process.env.DB_HOST || '127.0.0.1',
  port: Number(url ? url.port : process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  define: { underscored: true },
  pool: { max: 10, min: 0, idle: 10000 },
  dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {}
};

module.exports = {
  development: base,
  test: { ...base, database: `${base.database}_test` },
  production: base
};
