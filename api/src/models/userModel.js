const pool = require('../config/db');

async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.role_id, u.created_at, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function create({ email, passwordHash, roleId }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role_id)
     VALUES ($1, $2, $3)
     RETURNING id, email, role_id, created_at`,
    [email, passwordHash, roleId]
  );
  return rows[0];
}

async function findRoleByName(name) {
  const { rows } = await pool.query(
    'SELECT id FROM roles WHERE name = $1',
    [name]
  );
  return rows[0] || null;
}

module.exports = { findByEmail, create, findRoleByName };
