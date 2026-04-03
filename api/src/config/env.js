const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const required = ['DATABASE_URL', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port:         parseInt(process.env.PORT, 10) || 3000,
  databaseUrl:  process.env.DATABASE_URL,
  jwtSecret:    process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  nodeEnv:      process.env.NODE_ENV || 'development',
  logLevel:     process.env.LOG_LEVEL || 'info',
};
