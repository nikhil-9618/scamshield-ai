# Deployment guide

This document covers a single-host Docker Compose deployment and the hardening steps required
before exposing ScamShield AI to real users. It deliberately avoids claiming that any checklist
makes the platform "secure".

## 1. Prerequisites

* A Linux host with Docker Engine 24+ and Compose v2.
* A DNS name and TLS certificate (Caddy, nginx or a managed load balancer).
* At least 2 vCPU / 4 GB RAM for the web, API, PostgreSQL, Redis and AI engine together.
* Outbound HTTPS for threat-intelligence providers and, if configured, the LLM endpoint.

## 2. Secrets

Generate independent secrets; never reuse them:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # INTERNAL_SERVICE_TOKEN
openssl rand -base64 24   # POSTGRES_PASSWORD
```

Store them in `.env` on the host with `chmod 600`, or in your orchestrator's secret store. Do not
commit `.env`. The API refuses to start in `NODE_ENV=production` if the encryption key or internal
token is missing, cookies are not secure, development fixtures are enabled, or CORS contains a
wildcard.

## 3. Configure `.env`

Minimum production values:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://app.example.com
CORS_ORIGINS=https://app.example.com
NEXT_PUBLIC_APP_URL=https://app.example.com
COOKIE_SECURE=true
DATABASE_URL=postgresql://scamshield:...@postgres:5432/scamshield?schema=public
REDIS_URL=redis://redis:6379
APP_ENCRYPTION_KEY=...
INTERNAL_SERVICE_TOKEN=...
AI_ENGINE_URL=http://ai-engine:8000
ENABLE_API_DOCS=false
SEED_DEMO_DATA=false
```

Add provider keys only if you have read their terms and rate limits. Set
`THREAT_INTEL_DEV_FIXTURES=false`. Configure SMTP if you want verification and alert emails;
otherwise links are logged only in development.

## 4. Start

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

The API applies committed migrations on start. If migrations fail, do not bypass them: inspect
`docker compose logs api`, fix the schema/migration, and retry. Back up the database before any
migration in production.

Create the first administrator with the idempotent seed, passing credentials through the
environment (never as command-line arguments that leak into shell history):

```bash
read -rsp "Admin password: " SEED_ADMIN_PASSWORD && export SEED_ADMIN_PASSWORD
docker compose exec -e SEED_ADMIN_EMAIL=you@example.com -e SEED_ADMIN_PASSWORD \
  -e SEED_DEMO_DATA=false api npm run prisma:seed -w @scamshield/api
unset SEED_ADMIN_PASSWORD
```

Sign in, enable MFA, then create further accounts through registration.

## 5. Reverse proxy and TLS

Terminate TLS at the proxy and forward to `127.0.0.1:3000`. The API needs `TRUST_PROXY=1` (already
set in Compose) so client IPs and secure-cookie decisions are correct. Do not expose the API port
publicly: the browser only needs the web origin. The AI engine must stay on the internal network.

Example nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Add HSTS at the proxy only after HTTPS is confirmed working. The app sets its own CSP, frame and
referrer headers; avoid loosening them.

## 6. Health and monitoring

* `GET /health` — liveness, no auth, outside the `/api` prefix.
* `GET /health/ready` — database/readiness check.
* `GET /api/admin/system-health` — database, Redis, queue, AI engine and provider health (admin).
* Container health checks are defined in the Dockerfiles and Compose file.

Alert on readiness failures, failed scans, queue failures (`/admin/health`) and unusual
authentication failures (`/admin/audit`). Audit logs exclude secrets and scan content.

## 7. Backups and retention

* Use `pg_dump` on a schedule and test restores. A backup you have never restored is a guess.
* Redis holds queue state, not authoritative scan data; losing it should not lose completed scans.
* Consented content expires on the user's retention schedule. Keep a purge job/periodic sweep and
  verify it runs; the API also purges non-consented content when a scan completes.
* Account deletion removes personal rows; community reports are detached, not silently deleted.

## 8. Scaling

* The API is stateless apart from sessions in PostgreSQL; run multiple replicas behind the proxy.
* Set `REDIS_URL` before scaling so BullMQ distributes scan jobs and throttling is shared.
* Keep AI engine concurrency modest (CPU-bound OCR/scikit-learn); scale it separately.
* PostgreSQL is the bottleneck for analytics; add indexes/read replicas based on measurements,
  not guesses.

## 9. Upgrades

1. Back up PostgreSQL.
2. Pull the new images/code.
3. Review migrations in `apps/api/prisma/migrations/`.
4. `docker compose up -d --build`.
5. Check `/health/ready`, sign in, run a test scan, inspect `/admin/health`.
6. Roll back images if needed; migrations may require a forward fix rather than a downgrade.

## 10. Provider configuration

| Provider | Variable | Notes |
| --- | --- | --- |
| Google Safe Browsing | `GOOGLE_SAFE_BROWSING_API_KEY` | Subject to Google's terms and quotas |
| VirusTotal | `VIRUSTOTAL_API_KEY` | Public API is rate limited; cache aggressively |
| URLhaus | `URLHAUS_ENABLED=true` | Public feed; no key |
| PhishTank | `PHISHTANK_ENABLED`, `PHISHTANK_API_KEY` | Availability varies |
| LLM explainer | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Any OpenAI-compatible endpoint; receives structured findings only |

If a provider is down, its absence is listed as a limitation on the result — silence is never
treated as evidence of safety.

## 11. What this deployment does not give you

* A security certification or a guarantee that scams will be detected.
* Protection from a compromised host, a stolen administrator session, or malicious insiders.
* Real-world validated model accuracy.
* Payment/subscription processing (not implemented).
