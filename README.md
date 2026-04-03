# PulseWatch

A production-grade service monitoring platform. Registers HTTP/HTTPS endpoints, pings them on a configurable interval, and exposes uptime and response-time history through a REST API secured with JWT authentication and role-based access control.

## Architecture

```
┌──────────────────────────┐       ┌──────────────────────────┐
│       API Server         │       │     Background Worker    │
│  (Express · JWT · RBAC)  │       │  (polls every 30 s)      │
│                          │       │                          │
│  POST  /auth/register    │       │  SELECT * FROM services  │
│  POST  /auth/login       │       │  fetch each URL          │
│  GET   /services         │       │  INSERT monitoring_result│
│  POST  /services         │       └────────────┬─────────────┘
│  DELETE /services/:id    │                    │
│  GET   /services/:id/    │                    │ reads / writes
│        results           │                    │
│  GET   /health           │       ┌────────────▼─────────────┐
│  GET   /ready  ──────────┼──────▶│       PostgreSQL         │
└──────────────────────────┘       └──────────────────────────┘
```

Both processes are independent — no shared code, no IPC. They communicate only through the database.

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 (built-in `fetch` and `AbortSignal.timeout` required) |
| PostgreSQL | ≥ 14 |
| npm | ≥ 9 |

## Quick Start

### 1. Create and configure the database

```bash
psql -U postgres -c "CREATE DATABASE pulsewatch;"
psql -U postgres -d pulsewatch -f db/schema.sql
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Open .env and set DATABASE_URL, JWT_SECRET, and any other values
```

### 3. Install dependencies

```bash
cd api    && npm install && cd ..
cd worker && npm install && cd ..
```

### 4. Start the API server

```bash
cd api
npm start
# API is now listening on http://localhost:3000
```

### 5. Start the background worker (separate terminal)

```bash
cd worker
npm start
# Worker runs immediately, then every CHECK_INTERVAL_MS milliseconds
```

### Development mode (auto-restart on file change)

```bash
# Terminal 1
cd api && npm run dev

# Terminal 2
cd worker && npm run dev
```

## Environment Variables

Both services read from the `.env` file at the **project root** (`pulsewatch/.env`). Copy `.env.example` and fill in your values — never commit the actual `.env` file.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Port the API server listens on |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/pulsewatch` |
| `JWT_SECRET` | **Yes** | — | Secret used to sign JWT tokens. Use a long random string in production |
| `JWT_EXPIRES_IN` | No | `7d` | Token lifetime (any value accepted by the `jsonwebtoken` library) |
| `CHECK_INTERVAL_MS` | No | `30000` | Worker polling interval in milliseconds |
| `NODE_ENV` | No | `development` | Runtime environment (`development` / `production`) |
| `LOG_LEVEL` | No | `info` | Winston log level: `error`, `warn`, `info`, `debug` |

## API Reference

All endpoints except `/health`, `/ready`, `POST /auth/register`, and `POST /auth/login` require a valid JWT in the request header:

```
Authorization: Bearer <token>
```

---

### Authentication

#### `POST /auth/register`

Create a new user account.

**Request body**

```json
{
  "email": "alice@example.com",
  "password": "supersecret",
  "role": "viewer"
}
```

| Field | Required | Notes |
|---|---|---|
| `email` | Yes | Must be a valid email address |
| `password` | Yes | Minimum 8 characters |
| `role` | No | `admin`, `developer`, or `viewer` (default: `viewer`) |

**Responses**

| Status | Meaning |
|---|---|
| `201 Created` | User created successfully |
| `400 Bad Request` | Validation error (see `error` field) |
| `409 Conflict` | Email already registered |

---

#### `POST /auth/login`

Authenticate and receive a JWT token.

**Request body**

```json
{
  "email": "alice@example.com",
  "password": "supersecret"
}
```

**Response `200 OK`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

---

### Services

#### `GET /services`

Return all registered services.

**Roles:** `viewer`, `developer`, `admin`

**Response `200 OK`**

```json
[
  {
    "id": 1,
    "name": "Production API",
    "url": "https://api.example.com/health",
    "owner_id": 3,
    "owner_email": "alice@example.com",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

#### `POST /services`

Register a new service to monitor.

**Roles:** `admin` only

**Request body**

```json
{
  "name": "Production API",
  "url": "https://api.example.com/health"
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | 1–255 characters |
| `url` | Yes | Must be a valid `http://` or `https://` URL |

**Responses**

| Status | Meaning |
|---|---|
| `201 Created` | Service registered; full service object returned |
| `400 Bad Request` | Validation error |
| `403 Forbidden` | Caller is not an admin |

---

#### `DELETE /services/:id`

Remove a service and all its monitoring history.

**Roles:** `admin` only

**Responses**

| Status | Meaning |
|---|---|
| `200 OK` | `{ "message": "Service deleted successfully" }` |
| `400 Bad Request` | `:id` is not a valid integer |
| `403 Forbidden` | Caller is not an admin |
| `404 Not Found` | No service with that ID |

---

#### `GET /services/:id/results`

Return the 100 most recent monitoring results for a service.

**Roles:** `viewer`, `developer`, `admin`

**Response `200 OK`**

```json
{
  "service": {
    "id": 1,
    "name": "Production API",
    "url": "https://api.example.com/health",
    "owner_id": 3,
    "owner_email": "alice@example.com",
    "created_at": "2024-01-15T10:00:00.000Z"
  },
  "results": [
    {
      "id": 512,
      "service_id": 1,
      "status": "UP",
      "response_time": 142,
      "checked_at": "2024-01-15T11:30:00.000Z"
    }
  ]
}
```

`status` is either `"UP"` (service responded) or `"DOWN"` (network error or timeout).  
`response_time` is in milliseconds.

---

### Health & Readiness Probes

#### `GET /health`

Kubernetes **liveness** probe. Returns `200` as long as the Node.js process is alive.

```json
{ "status": "ok" }
```

#### `GET /ready`

Kubernetes **readiness** probe. Executes `SELECT 1` against PostgreSQL.

| Status | Meaning |
|---|---|
| `200 OK` | `{ "status": "ready" }` — DB reachable |
| `503 Service Unavailable` | `{ "status": "unavailable", "error": "..." }` — DB unreachable |

---

## Role Permissions Matrix

| Endpoint | viewer | developer | admin |
|---|:---:|:---:|:---:|
| `POST /auth/register` | ✓ | ✓ | ✓ |
| `POST /auth/login` | ✓ | ✓ | ✓ |
| `GET /services` | ✓ | ✓ | ✓ |
| `POST /services` | ✗ | ✗ | ✓ |
| `DELETE /services/:id` | ✗ | ✗ | ✓ |
| `GET /services/:id/results` | ✓ | ✓ | ✓ |
| `GET /health` | ✓ | ✓ | ✓ |
| `GET /ready` | ✓ | ✓ | ✓ |

## Database Schema

```
roles              users                  services
─────────────      ──────────────────     ──────────────────
id   SERIAL PK     id   SERIAL PK         id         SERIAL PK
name VARCHAR UQ     email      VARCHAR UQ  name       VARCHAR
                   password_hash VARCHAR  url        VARCHAR
                   role_id   → roles.id   owner_id → users.id
                   created_at TIMESTAMPTZ created_at TIMESTAMPTZ

monitoring_results
──────────────────────
id            SERIAL PK
service_id  → services.id  (ON DELETE CASCADE)
status        VARCHAR   ('UP' | 'DOWN')
response_time INTEGER   (milliseconds)
checked_at    TIMESTAMPTZ
```

## Logging

All logs are emitted as JSON to stdout:

```json
{
  "level": "info",
  "message": "HTTP request",
  "service": "pulsewatch-api",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 200,
  "durationMs": 38,
  "timestamp": "2024-01-15T11:30:00.123Z"
}
```

Set `LOG_LEVEL=debug` for verbose output during development.

## Project Roadmap

This repository is **Phase 1** of a multi-phase DevOps portfolio project:

| Phase | Description | Status |
|---|---|---|
| **1** | Node.js application with PostgreSQL | ✅ Complete |
| **2** | Docker and Docker Compose | Upcoming |
| **3** | Kubernetes manifests and Helm chart | Upcoming |
| **4** | Jenkins CI/CD pipeline and Terraform | Upcoming |
| **5** | Prometheus metrics and Grafana dashboards | Upcoming |
| **6** | Full deployment to AWS EKS with RDS | Upcoming |

Every configuration value comes from environment variables so the **same codebase runs unchanged** across all phases: local development, Docker, Kubernetes, and AWS.
