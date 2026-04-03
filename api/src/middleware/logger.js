const winston = require('winston');
const env = require('../config/env');

const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'pulsewatch-api' },
  transports: [
    new winston.transports.Console(),
  ],
});

module.exports = logger;
