const express = require('express');
const pool = require('./src/config/db');
const logger = require('./src/middleware/logger');
const authRoutes = require('./src/routes/authRoutes');
const serviceRoutes = require('./src/routes/serviceRoutes');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Structured request logging
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      method:     req.method,
      path:       req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip:         req.ip,
    });
  });
  next();
});

// Kubernetes liveness probe — always 200 while process is alive
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Kubernetes readiness probe — 503 if DB is unreachable
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    logger.error('Readiness check failed — DB unreachable', { error: err.message });
    res.status(503).json({ status: 'unavailable', error: 'Database connection failed' });
  }
});

app.use('/auth', authRoutes);
app.use('/services', serviceRoutes);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
