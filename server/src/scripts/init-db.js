/**
 * Creates the full schema from database/schema.sql on an empty database.
 * Safe to run on every deploy: if the tables already exist it does nothing.
 *
 *   npm run db:init     schema (if needed) + admin + settings
 */
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../models');

async function main() {
  await sequelize.authenticate();

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
