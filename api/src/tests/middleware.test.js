jest.mock('../config/env', () => ({
  port: 3000,
  databaseUrl: 'postgresql://test:test@localhost/test',
  jwtSecret: 'test-secret-key-for-testing',
  jwtExpiresIn: '7d',
  nodeEnv: 'test',
  logLevel: 'error',
}));

const jwt = require('jsonwebtoken');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const TEST_JWT_SECRET = 'test-secret-key-for-testing';

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authenticate middleware', () => {
  test('missing Authorization header entirely returns 401', () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authorization header missing or malformed' });
    expect(next).not.toHaveBeenCalled();
  });

  test('Authorization header without "Bearer " prefix returns 401', () => {
    const req = { headers: { authorization: 'Token somecredential' } };
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authorization header missing or malformed' });
    expect(next).not.toHaveBeenCalled();
  });

  test('malformed JWT (not a valid token) returns 401', () => {
    const req = { headers: { authorization: 'Bearer thisisnotavalidjwt' } };
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('expired JWT returns 401', () => {
    const expiredToken = jwt.sign(
      { sub: 1, email: 'user@test.com', role: 'viewer', exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_JWT_SECRET
    );
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('valid JWT sets req.user to decoded payload and calls next', () => {
    const token = jwt.sign(
      { sub: 5, email: 'admin@test.com', role: 'admin' },
      TEST_JWT_SECRET,
      { expiresIn: '1h' }
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ sub: 5, email: 'admin@test.com', role: 'admin' });
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('authorize middleware', () => {
  test('user with the correct single role calls next', () => {
    const middleware = authorize('admin');
    const req = { user: { role: 'admin' } };
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('user whose role is not in the allowed list returns 403', () => {
    const middleware = authorize('admin');
    const req = { user: { role: 'viewer' } };
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  test('admin passes when multiple roles are allowed', () => {
    const middleware = authorize('admin', 'developer', 'viewer');
    const req = { user: { role: 'admin' } };
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('developer passes when multiple roles are allowed', () => {
    const middleware = authorize('admin', 'developer', 'viewer');
    const req = { user: { role: 'developer' } };
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('viewer passes when multiple roles are allowed', () => {
    const middleware = authorize('admin', 'developer', 'viewer');
    const req = { user: { role: 'viewer' } };
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
