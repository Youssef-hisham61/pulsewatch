const pool = require('./config/db');
const logger = require('./logger');

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Pings a single service via HTTP/HTTPS and writes a monitoring_result row.
 * Any HTTP response (including 4xx/5xx) is considered UP — the server is reachable.
 * A network error or timeout is considered DOWN.
 *
 * @param {{ id: number, name: string, url: string }} service
 */
async function checkService(service) {
  const start = Date.now();
  let status = 'DOWN';
  let responseTime = null;

  try {
    await fetch(service.url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Don't follow redirects indefinitely
      redirect: 'follow',
    });
    responseTime = Date.now() - start;
    status = 'UP';
  } catch (err) {
    responseTime = Date.now() - start;
    logger.warn('Service unreachable', {
      serviceId: service.id,
      name:      service.name,
      url:       service.url,
      error:     err.message,
    });
  }

  try {
    await pool.query(
      `INSERT INTO monitoring_results (service_id, status, response_time)
       VALUES ($1, $2, $3)`,
      [service.id, status, responseTime]
    );
    logger.info('Check recorded', {
      serviceId:    service.id,
      name:         service.name,
      status,
      responseTime,
    });
  } catch (err) {
    logger.error('Failed to persist monitoring result', {
      serviceId: service.id,
      error:     err.message,
    });
  }
}

module.exports = { checkService };
