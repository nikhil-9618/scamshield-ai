# Cross-cutting test assets

Most tests live next to the code they cover:

| Suite | Location | Runner |
| --- | --- | --- |
| Detection rules, scoring, SSRF, TOTP, email headers | `apps/api/test/*.spec.ts` | Jest |
| API integration (Postgres, CSRF, RBAC, isolation) | `apps/api/test/api.e2e.spec.ts` | Jest + supertest |
| Web helpers and risk thresholds | `apps/web/lib/*.test.ts` | Vitest |
| AI classifier, explanation fallback, QR content typing | `apps/ai-engine/tests/` | pytest |

## Synthetic data

All fixtures are synthetic and contain no real personal data:

* Scam and benign message examples live in `apps/ai-engine/app/data/synthetic_messages.jsonl`.
* API unit tests construct their own inputs inline.
* Integration tests create uniquely named accounts in the `scamshield_test` database.

## Running

```bash
npm run test:api
npm run test:web
cd apps/ai-engine && python -m pytest tests -q
```

The API integration suite requires a reachable PostgreSQL database named by `TEST_DATABASE_URL`
(default `postgresql://scamshield:scamshield@127.0.0.1:5432/scamshield_test`) with migrations
applied. It never uses the development database. Do not point it at production.

## What is not covered yet

* Browser end-to-end journeys (Playwright) are not part of CI.
* Load, fuzzing and dependency-CVE gating are not automated.
* The classifier's evaluation is a held-out split of synthetic data, not a real-world benchmark.
