# PulseWatch

A service monitoring platform I built as a DevOps portfolio project.
You register HTTP/HTTPS endpoints, it pings them on a configurable set interval,
and stores uptime and response time history. The API is secured with
JWT auth and role-based access control.

## How it works

Four containerized services working together — no shared code between the application processes:

```mermaid
flowchart TB
    client["Client"]

    subgraph edge["Edge"]
        proxy["Nginx (Compose)<br/>or Gateway API (Kubernetes)<br/>rate limiting - port 80"]
    end

    subgraph app["Application"]
        api["<b>API Server</b><br/>Express · JWT · RBAC<br/><br/>/auth/register · /auth/login<br/>/services (GET POST DELETE)<br/>/services/:id/results<br/>/health · /ready"]
        worker["<b>Background Worker</b><br/>polls every 30s<br/><br/>1. SELECT services<br/>2. fetch each URL<br/>3. INSERT result"]
    end

    db[("<b>PostgreSQL</b><br/>roles · users<br/>services<br/>monitoring_results")]
    targets["Monitored endpoints<br/>(the URLs you register)"]

    client -->|HTTP| proxy
    proxy --> api
    api <-->|read / write| db
    worker <-->|read / write| db
    worker -.->|health check| targets

    classDef store fill:#1f2937,stroke:#4b5563,color:#f9fafb
    class db store
```

**The API and the worker never talk to each other.** They share no code, no
IPC, no memory — only the database. That is the whole design: either one can be
restarted, rebuilt, or scaled without the other noticing.

I built it this way on purpose: the stateless API is the part that scales
horizontally, while the worker stays single-replica (two workers would double
every monitoring check). That separation is what makes the Kubernetes phase
below possible.

## Running with Docker (the recommended way) (stable)

The easiest way to run PulseWatch is with Docker Compose — one command
starts all four services.

**1. Environment**

```bash
cp .env.example .env.docker
```

Open `.env.docker` and fill in your values. See the environment variables
table below for what's needed.

**2. Start everything**

```bash
docker compose --env-file .env.docker up --build
```

This starts PostgreSQL, the API server, the background worker, and Nginx.
The schema is initialized automatically on first run.

**3. Test it**

```bash
curl http://localhost/health
```

All API traffic goes through Nginx on port 80 — no port number needed.

**4. Stop everything**

```bash
docker compose down
```

Data persists in a named Docker volume between restarts. To wipe everything
including the database:

```bash
docker compose down -v
```

## Running locally (without Docker)

**1. Database**

```bash
psql -U postgres -c "CREATE DATABASE pulsewatch;"
psql -U postgres -d pulsewatch -f db/schema.sql
```

**2. Environment**

```bash
cp .env.example .env
```

Open `.env` and fill in your `DATABASE_URL` and `JWT_SECRET` at minimum.

**3. Dependencies**

```bash
cd api && npm install && cd ..
cd worker && npm install && cd ..
```

**4. Run**

```bash
# Terminal 1 - API server
cd api && npm start

# Terminal 2 - Background worker
cd worker && npm start
```

## Running on Kubernetes

Phase 4 runs PulseWatch on Kubernetes, packaged as a **Helm chart** and deployed by
**ArgoCD** straight from this repo (GitOps). Locally that's a 3-node
[kind](https://kind.sigs.k8s.io/) cluster (1 control-plane, 2 workers); the same
chart targets a real cluster (EKS) later with different values. Several things
change from the Docker Compose setup:

- **No Nginx.** Ingress is the **Gateway API** (Envoy Gateway), not a hand-rolled
  reverse proxy. A `Gateway` listens on port 80 and `HTTPRoute`s forward to the API;
  a `BackendTrafficPolicy` applies the rate limits Nginx used to (3 r/s on `/auth`,
  10 r/s elsewhere). I used Gateway API instead of Ingress on purpose, having already
  done Ingress during my CKA.
- **Postgres is a StatefulSet** with a headless Service and a PVC, instead of a
  Compose service with a named volume.
- **The API tier is horizontally scalable and HA** — something the single-node
  Compose setup can't express.
- **Secrets live in Git, encrypted** (Sealed Secrets) — no plaintext in the repo.
- **Deployment is GitOps** — push to Git, ArgoCD reconciles the cluster to match.

### The full cycle — commit to running pod

Nothing in this loop is triggered by hand. A commit is the only input, and the
cluster converges on it:

```mermaid
flowchart LR
    dev["<b>Developer</b><br/>feature branch"]
    develop["<b>develop</b><br/>integration branch"]
    main["<b>main</b><br/>release branch"]

    ci["<b>ci.yml</b><br/>jest → version bump<br/>→ build 3 images"]
    cv["<b>chart-validation.yml</b><br/>helm lint · template<br/>· kubeconform"]
    gate["<b>release gate</b><br/>tests only<br/>NO publish, NO bump"]

    hub[("<b>DockerHub</b><br/>private registry<br/>api · worker · postgres")]
    argo["<b>ArgoCD</b><br/>automated sync<br/>prune + self-heal"]
    k8s["<b>kind cluster</b><br/>Gateway :80<br/>api ×2-5 · worker · postgres"]
    users["Users"]

    dev -->|PR| develop
    develop -->|"changed api / worker / db"| ci
    develop -->|"changed helm / k8s"| cv
    ci -->|"push tagged images"| hub
    ci -->|"write image.tag into values.yaml<br/>commit (skip ci)"| develop
    develop -->|"ArgoCD watches this branch"| argo
    argo -->|"render chart + apply"| k8s
    hub -.->|"image pull"| k8s
    k8s -->|"localhost:80"| users
    develop -->|"release PR"| main
    main --> gate

    classDef store fill:#1f2937,stroke:#4b5563,color:#f9fafb
    class hub store
```

Two details in there matter more than they look:

**The tag write-back closes the loop.** After CI bumps the version and pushes
`api-1.0.9`, it commits that tag straight into the chart's `values.yaml`. Without
that step the registry and the chart drift apart and you deploy a version you
never built. The commit carries `[skip ci]` so it can't trigger itself.

**Publishing only happens on `develop`.** It's the one branch that mints a
version, so it's the only branch allowed to publish. Every other branch — `main`
included — stops at the test gate, because reusing the version already in
`package.json` would overwrite an image tag that was already released.

### The Helm chart (`helm/pulsewatch`)

Everything is one parameterized chart. `values.yaml` drives the image tag, replica
counts, resources, autoscaling, storage, rate limits, and secret handling, so the
same chart deploys to kind now and EKS later without duplicated YAML.

| Templated resource | Purpose |
| --- | --- |
| postgres StatefulSet + headless Service + PVC | database with persistent storage |
| api Deployment + ClusterIP Service (80 → 3000) | stateless API |
| api HorizontalPodAutoscaler + PodDisruptionBudget | autoscaling + HA (below) |
| worker Deployment (no Service) | background poller |
| Gateway + HTTPRoutes | Gateway API ingress on port 80 |
| BackendTrafficPolicy (×2) | per-route rate limiting |
| SealedSecrets (×2) | encrypted DB + app secrets |

`GatewayClass eg` is installed once as cluster infra, and the raw manifests under
`k8s/` are kept as a pre-Helm reference and rollback.

### High availability (API tier)

The API is stateless, so it's the part that scales. It runs with an **HPA**
(2→5 replicas on CPU, via metrics-server), a **PodDisruptionBudget** so node
drains never take every replica down at once, and **pod anti-affinity** spreading
replicas across nodes so losing a node doesn't lose the API.

Postgres and the worker stay single-replica on purpose: scaling a raw Postgres
StatefulSet would split-brain across independent volumes, and a second worker
would double every monitoring check. Real database HA (an operator such as
CloudNativePG) is planned for a later phase.

### GitOps with ArgoCD

An ArgoCD `Application` ([`gitops/`](gitops/Pulsewatch-application.yaml)) points at
`helm/pulsewatch` on the `develop` branch with automated sync (prune + self-heal).
ArgoCD renders the chart and reconciles the cluster to match Git, so a merge is a
deploy and manual drift gets reverted. Secrets flow the same way: the chart ships
**SealedSecrets** (encrypted, safe to commit), which the in-cluster sealed-secrets
controller decrypts into the Secrets the app uses.

### CI/CD (GitHub Actions)

Two path-filtered pipelines keep code and config concerns separate:

- **`ci.yml`** (on `api/`, `worker/`, `db/` changes) runs tests, bumps the version,
  builds and pushes the images, then writes the new tag back into the chart's
  `values.yaml` so ArgoCD deploys it. Publishing is guarded to `develop`; on every
  other branch the job stops after the tests.
- **`chart-validation.yml`** (on `helm/`, `k8s/` changes) runs `helm lint`,
  `helm template`, and `kubeconform` — no build, no deploy, just catches broken config.

Both also run on pull requests, and both are **required status checks** on `main`,
so a release PR has to be green before it can merge.

### Bring it up

The full reproducible setup — kind, Envoy Gateway, metrics-server, Sealed Secrets,
ArgoCD, and `cloud-provider-kind` (which gives the Gateway a real LoadBalancer on
`localhost:80`) — lives in [`cluster/README.md`](cluster/README.md). Once it's running:

```bash
curl http://localhost/health   # {"status":"ok"}
curl http://localhost/ready    # {"status":"ready"}  (checks the DB)
kubectl get application pulsewatch -n argocd   # SYNCED / HEALTHY
```

## Project Structure

```
pulsewatch/
├── api/                  # Express API server
│   ├── src/
│   │   ├── config/       # Environment config, DB connection
│   │   ├── controllers/  # Request handlers
│   │   ├── middleware/   # Auth, RBAC, logging
│   │   ├── models/       # DB query functions
│   │   └── routes/       # Route definitions
│   ├── Dockerfile
│   └── index.js
├── worker/               # Background monitoring worker
│   ├── src/
│   │   ├── checker.js    # Ping logic
│   │   └── scheduler.js  # Interval management
│   ├── Dockerfile
│   └── index.js
├── db/
│   ├── Dockerfile        # Custom postgres image with schema baked in
│   └── schema.sql
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf        # Reverse proxy + rate limiting (Docker Compose only)
├── helm/pulsewatch/      # Helm chart — the deploy artifact for Phase 4
│   ├── Chart.yaml
│   ├── values.yaml       # image tag, replicas, resources, HPA, rate limits, secrets
│   └── templates/        # postgres, api (+hpa/pdb), worker, gateway, ratelimit, sealed-secrets
├── gitops/               # ArgoCD Application (GitOps) -> helm/pulsewatch on develop
│   └── Pulsewatch-application.yaml
├── k8s/                  # Raw manifests: pre-Helm reference / rollback + GatewayClass
│   ├── namespace.yaml  postgres.yaml  api.yaml  worker.yaml
│   ├── gateway.yaml  gatewayclass.yaml  api-hpa.yaml  api-pdb.yaml
│   └── secrets.example.yaml
├── cluster/              # Local kind bring-up + on/off scripts (see cluster/README.md)
│   ├── kind-config.yaml  Dockerfile.cloud-provider-kind
│   ├── start.sh  stop.sh
│   └── README.md
├── .github/workflows/    # ci.yml (build/push/bump) + chart-validation.yml
├── docker-compose.yml
└── .env.example
```

## Environment Variables

Two env files — `.env` for local development, `.env.docker` for Docker Compose.
Neither is committed to the repository. Copy `.env.example` to get started.

| Variable            | Required     | Default       | Description                                                                           |
| ------------------- | ------------ | ------------- | ------------------------------------------------------------------------------------- |
| `PORT`              | No           | `3000`        | Port the API server listens on                                                        |
| `DATABASE_URL`      | **Yes**      | —             | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/pulsewatch` |
| `JWT_SECRET`        | **Yes**      | —             | Secret used to sign JWT tokens. Use a long random string in production                |
| `JWT_EXPIRES_IN`    | No           | `7d`          | Token lifetime (any value accepted by the `jsonwebtoken` library)                     |
| `CHECK_INTERVAL_MS` | No           | `30000`       | Worker polling interval in milliseconds                                               |
| `NODE_ENV`          | No           | `development` | Runtime environment (`development` / `production`)                                    |
| `LOG_LEVEL`         | No           | `info`        | Winston log level: `error`, `warn`, `info`, `debug`                                   |
| `POSTGRES_USER`     | Yes (Docker) | —             | PostgreSQL username for Docker Compose                                                |
| `POSTGRES_PASSWORD` | Yes (Docker) | —             | PostgreSQL password for Docker Compose                                                |
| `POSTGRES_DB`       | Yes (Docker) | —             | PostgreSQL database name for Docker Compose                                           |

## API

Protected endpoints require a JWT in the Authorization header:

```
Authorization: Bearer <token>
```

All traffic enters on port 80 — through Nginx under Docker Compose, through the
Gateway on Kubernetes. Both apply the same limits:

- `/auth/` endpoints — 3 requests per second
- All other endpoints — 10 requests per second

One difference worth knowing: Nginx limits **per client IP**, while Envoy's local
rate limiting is a **shared bucket per route**. Per-IP limiting on Kubernetes needs
global rate limiting (a Redis-backed rate-limit service), which isn't set up here.

---

### Auth

#### POST /auth/register

Create a new user account.

```json
{
  "email": "user@example.com",
  "password": "your_pass:)",
  "role": "viewer"
}
```

Role defaults to `viewer` if not provided. Options: `admin`, `developer`, `viewer`.

| Status            | Meaning                   |
| ----------------- | ------------------------- |
| `201 Created`     | User created successfully |
| `400 Bad Request` | Validation error          |
| `409 Conflict`    | Email already registered  |

---

#### POST /auth/login

Authenticate and receive a JWT token.

```json
{
  "email": "user@example.com",
  "password": "your_pass"
}
```

Returns:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

---

### Services

#### GET /services

Returns all registered services. Available to all roles.

| Status             | Meaning                  |
| ------------------ | ------------------------ |
| `200 OK`           | Array of service objects |
| `401 Unauthorized` | Missing or invalid token |

---

#### POST /services — admin only

Register a new service to monitor.

```json
{
  "name": "My API",
  "url": "https://api.example.com/health"
}
```

| Status            | Meaning            |
| ----------------- | ------------------ |
| `201 Created`     | Service registered |
| `400 Bad Request` | Validation error   |
| `403 Forbidden`   | Not an admin       |

---

#### DELETE /services/:id — admin only

Deletes the service and all its monitoring history.

| Status          | Meaning              |
| --------------- | -------------------- |
| `200 OK`        | Deleted successfully |
| `403 Forbidden` | Not an admin         |
| `404 Not Found` | Service not found    |

---

#### GET /services/:id/results

Returns the 100 most recent monitoring results for a service.
Available to all roles.

`status` is `"UP"` or `"DOWN"`, `response_time` is in milliseconds and
is `null` when the service is unreachable.

| Status          | Meaning           |
| --------------- | ----------------- |
| `200 OK`        | Results array     |
| `404 Not Found` | Service not found |

---

### Health

#### GET /health

Always returns `200` as long as the process is running.
Used as a Kubernetes liveness probe.

```json
{ "status": "ok" }
```

#### GET /ready

Checks database connectivity. Returns `200` if reachable, `503` if not.
Used as a Kubernetes readiness probe.

```json
{ "status": "ready" }
```

---

## Permissions

| Endpoint                    | viewer | developer | admin |
| --------------------------- | :----: | :-------: | :---: |
| `POST /auth/register`       |   ✓    |     ✓     |   ✓   |
| `POST /auth/login`          |   ✓    |     ✓     |   ✓   |
| `GET /services`             |   ✓    |     ✓     |   ✓   |
| `POST /services`            |   ✗    |     ✗     |   ✓   |
| `DELETE /services/:id`      |   ✗    |     ✗     |   ✓   |
| `GET /services/:id/results` |   ✓    |     ✓     |   ✓   |
| `GET /health`               |   ✓    |     ✓     |   ✓   |
| `GET /ready`                |   ✓    |     ✓     |   ✓   |

## Schema

```
roles              users                    services
─────────────      ────────────────────     ──────────────────
id   SERIAL PK     id    SERIAL PK          id         SERIAL PK
name VARCHAR UQ    email VARCHAR UQ         name       VARCHAR
                   password_hash VARCHAR    url        VARCHAR
                   role_id → roles.id       owner_id → users.id
                   created_at TIMESTAMPTZ   created_at TIMESTAMPTZ

monitoring_results
──────────────────────
id            SERIAL PK
service_id  → services.id  (ON DELETE CASCADE)
status        VARCHAR        'UP' | 'DOWN'
response_time INTEGER        milliseconds, null if DOWN
checked_at    TIMESTAMPTZ
```

## Logging

Structured JSON logs to stdout. Example:

```json
{
  "level": "info",
  "message": "HTTP request",
  "service": "pulsewatch-api",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 200,
  "durationMs": 38,
  "timestamp": "2026-04-03T01:11:22.158Z"
}
```

Set `LOG_LEVEL=debug` for verbose output.

## Roadmap

This is a multi-phase project. The same codebase runs across all phases —
every config value comes from environment variables so nothing needs to
change between local, Docker, Kubernetes, and AWS.

| Phase | What gets added                 | Status   |
| ----- | ------------------------------- | -------- |
| 1     | Node.js + PostgreSQL            | ✅ Done  |
| 2     | Docker + Docker Compose + Nginx | ✅ Done  |
| 3     | Jenkins + GitHub Actions CI/CD  | ✅ Done  |
| 4     | Kubernetes + Helm + ArgoCD      | ✅ Done — Helm chart, API HA, Gateway API + rate limiting, Sealed Secrets, GitOps via ArgoCD |
| 5     | Terraform                       | Upcoming |
| 6     | Prometheus + Grafana            | Upcoming |
| 7     | AWS EKS + RDS                   | Upcoming |
