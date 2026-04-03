const pool = require('../config/db');

async function getAll() {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.url, s.owner_id, s.created_at, u.email AS owner_email
       FROM services s
       JOIN users u ON u.id = s.owner_id
      ORDER BY s.created_at DESC`
  );
  return rows;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.url, s.owner_id, s.created_at, u.email AS owner_email
       FROM services s
       JOIN users u ON u.id = s.owner_id
      WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ name, url, ownerId }) {
  const { rows } = await pool.query(
    `INSERT INTO services (name, url, owner_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, url, ownerId]
  );
  return rows[0];
}

async function remove(id) {
  const { rows } = await pool.query(
    'DELETE FROM services WHERE id = $1 RETURNING id',
    [id]
  );
  return rows[0] || null;
}

async function getResults(serviceId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, service_id, status, response_time, checked_at
       FROM monitoring_results
      WHERE service_id = $1
      ORDER BY checked_at DESC
      LIMIT $2`,
    [serviceId, limit]
  );
  return rows;
}

module.exports = { getAll, findById, create, remove, getResults };
