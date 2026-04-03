// env.js must be the first import — it loads dotenv and validates required vars
const env = require('./src/config/env');
const app = require('./app');
const pool = require('./src/config/db');
const logger = require('./src/middleware/logger');

const server = app.listen(env.port, () => {
  logger.info('API server started', { port: env.port, nodeEnv: env.nodeEnv });
});

function shutdown(signal) {
  logger.info('Shutdown signal received, draining connections', { signal });

  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      await pool.end();
      logger.info('Database pool closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing database pool', { error: err.message });
      process.exit(1);
    }
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
