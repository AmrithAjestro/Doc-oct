/**
 * Creates the full schema from database/schema.sql. Safe to run on every deploy:
 * if the tables already exist it does nothing.
 *
 *   npm run db:init     create the database if missing (local) + schema + admin/settings
 *   npm run db:reset    drop every table and rebuild (local only - deletes all data!)
 */
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database')[process.env.NODE_ENV || 'development'];
const { sequelize } = require('../models');

const RESET = process.argv.includes('--reset');

/** Local PostgreSQL only: create the database itself if it does not exist yet. */
async function ensureDatabase() {
  if (process.env.DATABASE_URL) return; // hosted databases (Railway) already exist
  const admin = new Sequelize('postgres', dbConfig.username, dbConfig.password, { ...dbConfig, logging: false });
  try {
    const [rows] = await admin.query('SELECT 1 FROM pg_database WHERE datname = :name', { replacements: { name: dbConfig.database } });
    if (!rows.length) {
      await admin.query(`CREATE DATABASE "${dbConfig.database.replace(/"/g, '""')}"`);
      console.log(`✔ Database "${dbConfig.database}" created`);
    }
  } finally {
    await admin.close();
  }
}

async function main() {
  if (RESET && process.env.NODE_ENV === 'production') throw new Error('db:reset is disabled in production');
  await ensureDatabase();
  await sequelize.authenticate();

  if (RESET) {
    await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('✔ All tables dropped');
  }

  const [[{ exists }]] = await sequelize.query("SELECT to_regclass('public.users') IS NOT NULL AS exists");
  if (exists) {
    console.log('✔ Schema already present - skipping.');
  } else {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await sequelize.query(sql); // the file wraps itself in BEGIN/COMMIT
    console.log('✔ Schema created from database/schema.sql');
  }
  await sequelize.close();
}

main().catch(async (err) => {
  console.error('❌ Database init failed:', err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
