# PulseWatch - Project Context for Claude Code

## About this project

PulseWatch is a production-grade service monitoring platform built as a
DevOps portfolio project by Youssef, an Egyptian engineer transitioning
from backend to DevOps targeting remote Gulf roles.

## Current phase

Phase 1 complete - Node.js API + PostgreSQL running locally

## Upcoming phases

- Phase 2: Docker and Docker Compose
- Phase 3: Kubernetes and Helm
- Phase 4: Jenkins CI/CD and Terraform
- Phase 5: Prometheus and Grafana
- Phase 6: Full AWS EKS deployment with RDS

## Key decisions made

- bcryptjs used instead of bcrypt (WSL native compilation issue)
- Worker is completely separate from API - no shared code
- All config from environment variables - same code runs everywhere
- health and ready endpoints built for Kubernetes from day one

## Tech stack

- API: Node.js, Express, JWT, bcryptjs, Winston, pg, dotenv
- Worker: Node.js, Winston, pg, dotenv
- Database: PostgreSQL
- Future: Docker, Kubernetes, Terraform, Jenkins, Prometheus, AWS
