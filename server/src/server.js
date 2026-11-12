const config = require('./config/config');
const app = require('./app');
const { sequelize } = require('./models');
const scheduler = require('./jobs/scheduler');

async function main() {
  try {
    await sequelize.authenticate();
    console.log('🐘 PostgreSQL connected');
  } catch (err) {
    console.error('❌ Could not connect to PostgreSQL:', err.message);
    console.error('   Check DB_* in server/.env, then run: npm run db:setup');
    process.exit(1);
  }

  const server = app.listen(config.PORT, () => console.log(`🚀 API listening on http://localhost:${config.PORT}/api`));
  if (config.SCHEDULER_ENABLED) scheduler.start();

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down…`);
    server.close(() => sequelize.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
