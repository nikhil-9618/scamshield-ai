# ScamShield AI — REST API contract

Base URL: `/api`. OpenAPI JSON: `GET /api/docs-json`, Swagger UI: `/api/docs` (enabled outside production, or with `ENABLE_API_DOCS=true`).

## Conventions

- **Session auth.** `ss_session` HttpOnly cookie (opaque 256-bit token, hashed at rest) + `ss_csrf` cookie. Mutating requests from the browser must send `X-CSRF-Token` matching the session's CSRF secret and be same-origin.
- **Content type** `application/json`; uploads `multipart/form-data`.
- **Errors** share one envelope:
  ```json
  { "statusCode": 400, "error": "Bad Request", "message": "Validation failed", "details": { "url": ["URL must start with http:// or https://"] }, "requestId": "..." }
  ```
- **Rate limits** (per IP + per session): auth 10/min, scans 20/min (plan-based daily quota on top), reports 5/hour, general 120/min. `429` includes `Retry-After`.
- **Pagination** `?page=1&pageSize=20` → `{ items, page, pageSize, total, totalPages }`.
- **Authorization** `user` < `moderator` < `admin`; enforced server-side for every admin/moderator route.

## Auth

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | `{email, password, displayName, acceptTerms, marketingOptIn?}` → sets session, sends verification email (dev: logs link) |
| POST | `/auth/login` | public | `{email, password, mfaCode?}`; lockout after 5 failures (15 min); MFA required if enabled |
| POST | `/auth/logout` | session | revokes current session |
| POST | `/auth/logout-all` | session | revokes every session |
| GET | `/auth/session` | session | `{user, csrfToken}` |
| POST | `/auth/verify-email` | public | `{token}` |
| POST | `/auth/resend-verification` | session | rate-limited |
| POST | `/auth/forgot-password` | public | `{email}` — always `202`, no account enumeration |
| POST | `/auth/reset-password` | public | `{token, password}` — revokes all sessions |
| POST | `/auth/change-password` | session | `{currentPassword, newPassword}` — revokes other sessions |
| POST | `/auth/mfa/setup` | session | returns TOTP secret + `otpauth://` URI |
| POST | `/auth/mfa/enable` | session | `{code}` → enables MFA, returns recovery codes once |
| POST | `/auth/mfa/disable` | session | `{password}` |

## Scanning

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| POST | `/scans/message` | `{content, channel, consentToStore?}` | `ScanDetail` (completed or failed) |
| POST | `/scans/url` | `{url, consentToStore?}` | `ScanDetail` |
| POST | `/scans/screenshot` | multipart `file` (png/jpeg ≤5 MiB) | `ScanDetail` |
| POST | `/scans/qr` | multipart `file` | `ScanDetail` with `decodedValue`, never auto-opened |
| POST | `/scans/email` | `{raw, consentToStore?}` or multipart `.eml` ≤2 MiB | `ScanDetail` |
| POST | `/scans/:id/explain` | — | `{explanation: AiExplanation}` (idempotent, cached) |
| GET | `/scans` | `?page&pageSize&type&riskLevel&status` | `Paginated<ScanRecord>` (own scans only) |
| GET | `/scans/:id` | — | `ScanDetail` (404 for other users' scans) |
| DELETE | `/scans/:id` | — | `204`, soft-deletes and clears stored content |
| DELETE | `/scans` | — | `204`, clears own history |
| POST | `/scans/:id/feedback` | `{verdict, comment?}` | `ScanFeedbackDto` |

`ScanDetail` includes `analysis` (score, level, findings, extracted entities, coverage, limitations, engine versions), `aiExplanation` (labelled `llm` or `template`), `decodedValue`, and `errorMessage` when the scan failed.

## Threat intelligence

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/reports` | session | `{targetType, target, category, description, evidenceUrls?}` — dedupe → `duplicate` status, moderation required before intel promotion |
| GET | `/reports/mine` | session | `Paginated<CommunityReportDto>` |
| GET | `/threats` | session | `?q&page&pageSize` verified domains only |
| GET | `/threats/:domain` | session | domain, sources, verification, last seen |
| GET | `/threats/lookup?domain=` | session | compact reputation used by results UI |

## User / security centre

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/users/me` | profile, plan, preferences |
| PATCH | `/users/me` | display name, notification + privacy preferences (Zod) |
| GET | `/users/me/activity` | audit-backed recent activity (masked IPs) |
| GET | `/users/me/sessions` | active sessions, `current` flag |
| DELETE | `/users/me/sessions/:id` | revoke one session |
| GET | `/users/me/export` | JSON export of profile, scans, reports, feedback |
| DELETE | `/users/me` | `{password, confirm:"DELETE"}` — hard-deletes personal data |
| GET | `/notifications` | list + unread count |
| POST | `/notifications/:id/read` | mark read; `POST /notifications/read-all` |
| GET | `/dashboard/analytics` | real aggregates from `scans`/`notifications` |

## Admin (`admin` role, optionally `moderator` where noted)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/analytics` | users, scans, risk mix, trend, reports, provider health, abuse counters |
| GET | `/admin/users` | `?q&page&pageSize` — email, roles, status, scan counts |
| PATCH | `/admin/users/:id` | assign roles / suspend (cannot remove own last admin role) |
| GET | `/admin/reports` | moderation queue (`moderator`+) |
| PATCH | `/admin/reports/:id` | verify/reject/duplicate, optional threat-intel promotion (`moderator`+) |
| GET | `/admin/system-health` | DB, Redis, queue, AI engine, providers |
| GET | `/admin/audit-logs` | paginated audit trail (admin) |
| GET | `/admin/threats` | threat domain registry + source management |
| POST | `/admin/threats` | manual domain entry (`admin`) |
| GET | `/admin/providers` | provider configuration + last usage |

## Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/health/ready` | DB + Redis + AI engine readiness, no secrets |

## Status codes used

`200` ok · `201` created · `202` accepted (async email) · `204` no content · `400` validation · `401` unauthenticated · `403` forbidden/CSRF · `404` not found/not owned · `409` conflict · `413` upload too large · `415` unsupported media · `422` unprocessable payload (e.g. QR decode failed) · `429` rate limited · `503` dependency unavailable (degraded, never disguised as success).
