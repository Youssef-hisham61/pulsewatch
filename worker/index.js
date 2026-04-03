const path = require('path');
// Load env vars before any other module reads process.env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const scheduler = require('./src/scheduler');
const pool = require('./src/config/db');
const logger = require('./src/logger');

const intervalMs = parseInt(process.env.CHECK_INTERVAL_MS, 10) || 30_000;

logger.info('Worker process starting', {
  intervalMs,
  nodeEnv: process.env.NODE_ENV || 'development',
});

const timer = scheduler.start(intervalMs);

function shutdown(signal) {
  logger.info('Shutdown signal received', { signal });
  clearInterval(timer);

  pool.end()
    .then(() => {
      logger.info('Database pool closed');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Error closing database pool', { error: err.message });
      process.exit(1);
    });

  // Force-kill if graceful shutdown stalls after 10 s
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});
