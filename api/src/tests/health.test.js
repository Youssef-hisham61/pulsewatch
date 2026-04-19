jest.mock('../config/env', () => ({
  port: 3000,
  databaseUrl: 'postgresql://test:test@localhost/test',
  jwtSecret: 'test-secret-key-for-testing',
  jwtExpiresIn: '7d',
  nodeEnv: 'test',
  logLevel: 'error',
}));

jest.mock('../config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const app = require('../../app');
const pool = require('../config/db');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /health', () => {
  test('returns 200 with { status: "ok" } regardless of DB state', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  test('returns 200 with { status: "ready" } when DB query succeeds', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  test('returns 503 with { status: "unavailable" } when DB query throws', async () => {
    pool.query.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('status', 'unavailable');
  });
});
