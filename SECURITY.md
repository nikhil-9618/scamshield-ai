# Security policy and design notes

## Reporting a vulnerability

Do not open a public issue for a security problem. Contact the maintainers privately with:

* the affected component and version/commit,
* reproduction steps or a proof of concept,
* impact and any suggested fix.

You will get an acknowledgement, an assessment and a remediation plan. Please allow time for a fix
before disclosure. There is no bug bounty and no guarantee of a response time in this repository.

## What is implemented

These controls are implemented in code and covered by tests where noted:

* **Sessions** — 256-bit opaque tokens, hashed at rest, `HttpOnly` + `SameSite=Lax` cookies,
  server-side expiry/revocation, rotation on password reset, per-session CSRF hash.
* **CSRF** — same-origin check plus double-submit token bound to the session for mutating requests
  (integration-tested).
* **Passwords** — Argon2id with per-password salt, account lockout after repeated failures,
  generic error messages, reset tokens hashed and single-use.
* **MFA** — RFC 6238 TOTP with a one-period window and single-use recovery codes.
* **Authorization** — server-side role guard on every admin route; cross-user scan access returns
  404 (integration-tested). The UI hides controls but is never the boundary.
* **Input validation** — shared Zod schemas at the API edge; Prisma parameterised queries; React
  escaping; no `dangerouslySetInnerHTML` for user content.
* **Uploads** — size limits, MIME and magic-byte checks, in-memory processing, no execution.
* **SSRF** — protocol allowlist, no credentials, no IP literals or non-standard ports, DNS
  resolution with private/loopback/link-local/CGNAT/metadata/ULA blocking, pinned connections,
  manual redirect revalidation, timeouts and a 1 MB response cap (unit-tested).
* **Headers** — CSP, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`,
  `Referrer-Policy`, `Permissions-Policy`, no-store on API responses, HSTS in production.
* **Rate limiting** — global, auth, scan and report limits; in-memory without Redis, shared with
  Redis. Abuse counters are visible in the admin dashboard.
* **Audit logging** — authentication, moderation, role changes, threat changes and account
  operations, excluding secrets and scan content.
* **Encryption** — AES-256-GCM for raw content when storage is consented; content hashes for
  deduplication; automatic purge on completion or retention expiry.
* **AI** — the LLM receives structured findings only; output is schema/length validated and the
  score is never model-controlled.

## What is explicitly not claimed

* The platform is **not** certified to OWASP ASVS or any standard. It is informed by ASVS.
* No automated system can prove that a message, link or sender is safe. Results say so.
* The text classifier is trained on synthetic data and is not calibrated; no confidence
  percentage is shown.
* Third-party intelligence can be stale, unavailable or wrong; its absence is disclosed, not
  treated as safety.
* A compromised host, stolen administrator session, malicious dependency or insider is out of
  scope of these application controls.

## Dependency and secret hygiene

* No credentials are committed. `.env` is ignored; `.env.example` contains names only.
* Run `npm audit` and update deliberately, preserving the lockfile. CI builds the Docker images.
* Rotate `APP_ENCRYPTION_KEY` only with a migration plan: existing ciphertext becomes unreadable.
* Rotate `INTERNAL_SERVICE_TOKEN` on both the API and AI engine together.
