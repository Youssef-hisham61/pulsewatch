const pool = require('./config/db');
const { checkService } = require('./checker');
const logger = require('./logger');

/**
 * Fetches all registered services from the DB and checks each one concurrently.
 * Uses Promise.allSettled so a single failing check never aborts the others.
 */
async function runChecks() {
  let services;
  try {
    const { rows } = await pool.query('SELECT id, name, url FROM services');
    services = rows;
  } catch (err) {
    logger.error('Failed to fetch services from database', { error: err.message });
    return;
  }

  if (services.length === 0) {
    logger.info('No services registered — nothing to check');
    return;
  }

  logger.info('Starting check cycle', { serviceCount: services.length });

  const results = await Promise.allSettled(services.map(checkService));

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.warn('Some checks ended with unhandled rejections', { failed });
  }

  logger.info('Check cycle complete', { serviceCount: services.length });
}

/**
 * Starts the polling loop.
 * Runs immediately once, then repeats every `intervalMs` milliseconds.
 *
 * @param {number} intervalMs
 * @returns {NodeJS.Timeout} timer handle — pass to clearInterval to stop
 */
function start(intervalMs) {
  logger.info('Scheduler starting', { intervalMs });

  // Fire immediately, then on each interval tick
  runChecks();
  const timer = setInterval(runChecks, intervalMs);

  return timer;
}

module.exports = { start, runChecks };
