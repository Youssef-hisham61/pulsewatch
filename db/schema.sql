-- PulseWatch database schema
-- Run: psql -U <user> -d pulsewatch -f db/schema.sql

CREATE TABLE IF NOT EXISTS roles (
  id   SERIAL      PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (name) VALUES ('admin'), ('developer'), ('viewer')
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL       PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id       INTEGER      NOT NULL REFERENCES roles(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id         SERIAL        PRIMARY KEY,
  name       VARCHAR(255)  NOT NULL,
  url        VARCHAR(2048) NOT NULL,
  owner_id   INTEGER       NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring_results (
  id            SERIAL      PRIMARY KEY,
  service_id    INTEGER     NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  status        VARCHAR(4)  NOT NULL CHECK (status IN ('UP', 'DOWN')),
  response_time INTEGER,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_results_service_id
  ON monitoring_results (service_id, checked_at DESC);
