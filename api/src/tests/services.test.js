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
const jwt = require('jsonwebtoken');
const app = require('../../app');
const pool = require('../config/db');

const TEST_JWT_SECRET = 'test-secret-key-for-testing';

function makeToken(role) {
  const userIds = { admin: 1, developer: 2, viewer: 3 };
  return jwt.sign(
    { sub: userIds[role], email: `${role}@test.com`, role },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /services', () => {
  test('request without token returns 401', async () => {
    const res = await request(app).get('/services');
    expect(res.status).toBe(401);
  });

  test('malformed token (random string) returns 401', async () => {
    const res = await request(app)
      .get('/services')
      .set('Authorization', 'Bearer thisisnotajwt');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  test('expired token returns 401', async () => {
    const expiredToken = jwt.sign(
      { sub: 1, email: 'user@test.com', role: 'viewer', exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_JWT_SECRET
    );

    const res = await request(app)
      .get('/services')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  test('tampered token payload (modified role without re-signing) returns 401', async () => {
    const token = makeToken('viewer');
    const [header, encodedPayload, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
    payload.role = 'admin';
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedToken = [header, tamperedPayload, signature].join('.');

    const res = await request(app)
      .get('/services')
      .set('Authorization', `Bearer ${tamperedToken}`);

    expect(res.status).toBe(401);
  });

  test('valid viewer token returns 200 with an array', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/services')
      .set('Authorization', `Bearer ${makeToken('viewer')}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('valid developer token returns 200', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/services')
      .set('Authorization', `Bearer ${makeToken('developer')}`);

    expect(res.status).toBe(200);
  });

  test('valid admin token returns 200', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/services')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /services', () => {
  test('request without token returns 401', async () => {
    const res = await request(app)
      .post('/services')
      .send({ name: 'My API', url: 'https://example.com' });

    expect(res.status).toBe(401);
  });

  test('viewer token returns 403 Insufficient permissions', async () => {
    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('viewer')}`)
      .send({ name: 'My API', url: 'https://example.com' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Insufficient permissions' });
  });

  test('developer token returns 403 Insufficient permissions', async () => {
    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('developer')}`)
      .send({ name: 'My API', url: 'https://example.com' });

    expect(res.status).toBe(403);
  });

  test('admin token with missing name returns 400', async () => {
    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('admin')}`)
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'name is required' });
  });

  test('admin token with missing url returns 400', async () => {
    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('admin')}`)
      .send({ name: 'My API' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'url is required' });
  });

  test('admin token with invalid url format returns 400', async () => {
    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('admin')}`)
      .send({ name: 'My API', url: 'definitely not a url' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'url is not a valid URL' });
  });

  test('admin token with non http/https url (ftp) returns 400', async () => {
    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('admin')}`)
      .send({ name: 'My API', url: 'ftp://files.example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'url must use http or https' });
  });

  test('admin token with name over 255 characters returns 400', async () => {
    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('admin')}`)
      .send({ name: 'a'.repeat(256), url: 'https://example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'name must be 255 characters or fewer' });
  });

  test('admin token with valid body creates service and returns 201 with service object', async () => {
    const mockService = {
      id: 10,
      name: 'Production API',
      url: 'https://api.example.com',
      owner_id: 1,
      created_at: new Date().toISOString(),
    };
    pool.query.mockResolvedValueOnce({ rows: [mockService] });

    const res = await request(app)
      .post('/services')
      .set('Authorization', `Bearer ${makeToken('admin')}`)
      .send({ name: 'Production API', url: 'https://api.example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 10, name: 'Production API', url: 'https://api.example.com' });
  });
});

describe('DELETE /services/:id', () => {
  test('viewer token returns 403', async () => {
    const res = await request(app)
      .delete('/services/1')
      .set('Authorization', `Bearer ${makeToken('viewer')}`);

    expect(res.status).toBe(403);
  });

  test('developer token returns 403', async () => {
    const res = await request(app)
      .delete('/services/1')
      .set('Authorization', `Bearer ${makeToken('developer')}`);

    expect(res.status).toBe(403);
  });

  test('admin token with non-existent id returns 404 with "Service not found"', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/services/99999')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Service not found' });
  });

  test('admin token with non-integer id (letters) returns 400 with "Invalid service ID"', async () => {
    const res = await request(app)
      .delete('/services/abc')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid service ID' });
  });

  test('admin token with valid existing id returns 200 with success message', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const res = await request(app)
      .delete('/services/5')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Service deleted successfully' });
  });
});

describe('GET /services/:id/results', () => {
  test('request without token returns 401', async () => {
    const res = await request(app).get('/services/1/results');
    expect(res.status).toBe(401);
  });

  test('valid token with non-existent service id returns 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/services/99999/results')
      .set('Authorization', `Bearer ${makeToken('viewer')}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Service not found' });
  });

  test('valid token with existing service returns 200 with service object and results array', async () => {
    const mockService = {
      id: 1,
      name: 'Test Service',
      url: 'https://test.example.com',
      owner_id: 1,
      created_at: new Date().toISOString(),
      owner_email: 'admin@test.com',
    };
    const mockResults = [
      { id: 1, service_id: 1, status: 'UP', response_time: 112, checked_at: new Date().toISOString() },
      { id: 2, service_id: 1, status: 'DOWN', response_time: null, checked_at: new Date().toISOString() },
    ];
    pool.query
      .mockResolvedValueOnce({ rows: [mockService] })
      .mockResolvedValueOnce({ rows: mockResults });

    const res = await request(app)
      .get('/services/1/results')
      .set('Authorization', `Bearer ${makeToken('viewer')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('service');
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results).toHaveLength(2);
  });
});
