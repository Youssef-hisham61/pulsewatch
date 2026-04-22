jest.mock('../config/env', () => ({
  port: 3000,
  databaseUrl: 'postgresql://test:test@localhost/test',
  jwtSecret: 'test-secret-key-for-testing',
  jwtExpiresIn: '7d',
  nodeEnv: 'test',
  logLevel: 'error',
}));

jest.mock('../config/db', () => ({ query: jest.fn() }));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../app');
const pool = require('../config/db');

const TEST_JWT_SECRET = 'test-secret-key-for-testing';

beforeEach(() => {
  jest.resetAllMocks();
  bcrypt.hash.mockResolvedValue('$2b$12$mockedhashvalue');
});

describe('POST /auth/register', () => {
  test('missing email returns 400 with "email is required"', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'email is required' });
  });

  test('invalid email format returns 400 with "Invalid email format"', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email format' });
  });

  test('missing password returns 400 with "password is required"', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'password is required' });
  });

  test('password under 8 characters returns 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@test.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'password must be at least 8 characters' });
  });

  test('invalid role returns 400 listing allowed roles', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@test.com', password: 'password123', role: 'superuser' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role must be one of/);
  });

  test('duplicate email returns 409 with "Email already registered"', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'user@test.com', password_hash: '$2b$12$hash', role: 'viewer' }],
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email already registered' });
  });

  test('successful registration returns 201 with user object containing id, email, role', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })                // findByEmail — not found
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })       // findRoleByName — viewer role
      .mockResolvedValueOnce({                             // create user
        rows: [{ id: 42, email: 'user@test.com', role_id: 3, created_at: new Date() }],
      });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@test.com', password: 'password123', role: 'viewer' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User registered successfully');
    expect(res.body.user).toMatchObject({ id: 42, email: 'user@test.com', role: 'viewer' });
  });

  test('role defaults to viewer when not provided in request body', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })
      .mockResolvedValueOnce({
        rows: [{ id: 43, email: 'newuser@test.com', role_id: 3, created_at: new Date() }],
      });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'newuser@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('role', 'viewer');
  });
});

describe('POST /auth/login', () => {
  test('missing email returns 400 with "email is required"', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'email is required' });
  });

  test('missing password returns 400 with "password is required"', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'password is required' });
  });

  test('non-existent email returns 401 with "Invalid credentials"', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  test('wrong password returns 401 with "Invalid credentials"', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'user@test.com', password_hash: '$2b$12$somehash', role: 'viewer' }],
    });
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  test('successful login returns 200 with token and expiresIn', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'user@test.com', password_hash: '$2b$12$somehash', role: 'viewer' }],
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('expiresIn', '7d');
  });

  test('returned token is a valid JWT signed with the server secret', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 7, email: 'admin@test.com', password_hash: '$2b$12$somehash', role: 'admin' }],
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    const { token } = res.body;
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    const decoded = jwt.verify(token, TEST_JWT_SECRET);
    expect(decoded).toMatchObject({ sub: 7, email: 'admin@test.com', role: 'admin' });
  });
});
