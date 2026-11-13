# Deploy ScamShield AI on Render

The repository includes a [Render Blueprint](../render.yaml) that creates:

* `scamshield-web` — Next.js web app (Node runtime, public HTTPS)
* `scamshield-api` — NestJS API (Docker, public HTTPS, Prisma migrations on boot)
* `scamshield-ai` — FastAPI NLP/OCR/QR service (Docker, token-protected)
* `scamshield-db` — Render Postgres, wired to the API as `DATABASE_URL`
* a shared secret group with generated `APP_ENCRYPTION_KEY` and `INTERNAL_SERVICE_TOKEN`

The free plan deliberately runs scans **inline** instead of through BullMQ. A free Render Key Value
instance is in-memory, so a restart can lose queued scans and leave them stuck. To enable the queue
on a paid plan, add a Key Value instance and set `REDIS_URL` on `scamshield-api` to its internal
connection string; no application changes are needed.

## 1. Put the code on GitHub

Render deploys from a Git repository, not from this chat workspace. Commit and push the project to a
GitHub repository (private is fine). Do not commit `.env`; it is already ignored.

```bash
git add .
git commit -m "ScamShield AI"
git push -u origin main
```

## 2. Create the Blueprint

1. Sign in at <https://dashboard.render.com>.
2. **New → Blueprint**.
3. Connect the GitHub repository and select the branch containing `render.yaml`.
4. Render shows the four resources. When prompted for the two `sync: false` values, provide:
   * `BOOTSTRAP_ADMIN_EMAIL` — the administrator email you will sign in with.
   * `BOOTSTRAP_ADMIN_PASSWORD` — a unique password of at least 12 characters.
5. Click **Apply**. Render creates the database, AI engine, API, and web app.

The API container runs `prisma migrate deploy` before it starts listening. Migrations are retried up
to six times with a five-second delay, so a database that is still accepting connections during the
first boot does not kill the container immediately. The first admin is created only if no admin
account exists, from the two bootstrap variables. The password must be at least 12 characters and is
hashed with Argon2id; it is never logged. If the log says the bootstrap was skipped, correct the
variables in the service environment and redeploy.

## 3. Wait for the first deploy

Cold starts on the free plan can take a minute per service. The web server waits up to 90 seconds
for the API, which is enough for the normal free-tier wake-up. The first AI-enriched scan may still
get the deterministic template explanation if the AI container is still waking; the scan result is
valid and a later explanation request can use the AI engine. Watch:

* `scamshield-ai` → `/health` returns `{"status":"ok", ...}` with `ocr` and `qr` capabilities.
* `scamshield-api` → `/health` and `/health/ready` return 200.
* `scamshield-web` → `/` and `/login` return 200.

Open the web URL shown by Render (`https://scamshield-web.onrender.com` unless the name is taken).
Sign in with the bootstrap admin email and password.

## 4. Immediately after first sign-in

* Enable **MFA** in the security centre.
* Remove `BOOTSTRAP_ADMIN_PASSWORD` from the `scamshield-api` environment in Render (Environment →
  delete the variable → save). The admin already exists, so the bootstrap will not run again.
* If you entered a placeholder bootstrap email/password, change the admin password in the app before
  removing the variable.
* Create normal user accounts through registration. Email delivery is disabled by default; users can
  still use the product, but verification links are only written to API logs.

## 5. Verify end to end

1. Sign in and open **Scan centre**.
2. Scan a message such as: “Your SBI account will be blocked today. Complete KYC at
   http://sbi-kyc-verify.top and send the OTP to our executive immediately.”
3. Confirm a high/critical result with findings, evidence and recommended actions.
4. Open the dashboard and confirm the counters and charts reflect that scan.
5. Upload a QR image; confirm the decoded value is shown and **not** opened.
6. Sign in as the admin and open `/admin`; check provider health and the audit log.

## Free-plan limitations you must know

* **Free Postgres expires 30 days after creation.** After expiry there is a 14-day grace period to
  upgrade before deletion. For anything beyond a demo, change the database plan to a paid one
  (`basic-256mb` or higher) before real data is stored.
* **Free web services spin down after 15 minutes idle.** The first request afterwards takes about a
  minute. Three free services share the workspace’s 750 free instance hours per month.
* **Free web services cannot receive private network traffic.** The Blueprint therefore wires the
  web → API and API → AI calls through each service's public `RENDER_EXTERNAL_URL`. If the first
  sync shows an empty URL variable, open **Blueprint → Sync** again; Render fills in service URLs
  after creation. The API deliberately falls back to `http://localhost:3000` if `APP_ORIGIN` is
  empty so the first boot does not crash, but links and browser origins will be wrong until the
  Blueprint is re-synced and the API redeployed. The AI endpoints (except `/health`) require the
  generated internal token.
* **No shell and no one-off jobs on free services.** Migrations run automatically in the API
  container, and the admin is created from environment variables.
* **SMTP ports are blocked** on free services and email is disabled by default. Configure an email
  API/provider if you need verification and alert emails, or upgrade to a paid instance.
* **512 MB RAM per free service.** OCR uses Tesseract in the container and QR uses OpenCV. If large
  screenshots cause memory pressure, upgrade the AI service to `starter`.
* No free Key Value is provisioned. Scans run inline and complete before the response returns; this
  avoids losing jobs when an in-memory Key Value instance restarts. Add Redis on a paid plan for
  queueing.

## Optional providers

Set these on `scamshield-api` (and restart) when you have accounts. They are optional and failure is
disclosed per scan rather than treated as safety:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Google Safe Browsing reputation |
| `VIRUSTOTAL_API_KEY` | VirusTotal URL reports |
| `PHISHTANK_ENABLED=true` + key | PhishTank feed |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` on `scamshield-ai` | LLM explanations of structured findings |

Never paste keys into chat or commit them. Add them in the Render dashboard or as project secrets.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| API deploy fails immediately | Logs usually name a missing `APP_ENCRYPTION_KEY` / `INTERNAL_SERVICE_TOKEN` / `COOKIE_SECURE=true`; the Blueprint supplies them. |
| API starts but login fails | `DATABASE_URL` is attached, migrations ran, and `APP_ORIGIN` is the web HTTPS URL. |
| API logs `APP_ORIGIN was empty` | Re-sync the Blueprint so `APP_ORIGIN` picks up the web `RENDER_EXTERNAL_URL`, then redeploy the API. |
| API restarts before health check | Check the migration attempt logs; the entrypoint retries six times before exiting. Confirm the database is available and `DATABASE_URL` is attached. |
| First request after idle times out | The free services are still waking. Retry once; the web server waits up to 90 seconds for the API. |
| Web returns 503 on sign-in | The API is cold-starting or unreachable; open the API `/health` URL directly, then retry. |
| AI features unavailable | Open the AI `/health`; if OCR/QR are false, the image build is missing system packages. |
| Cookies are not set | `COOKIE_SECURE=true` requires HTTPS; use the Render URL, not a plain HTTP proxy. |
| Admin cannot sign in | Confirm the bootstrap email exactly; if an admin already existed, the bootstrap intentionally did nothing. Reset the password through the app. |

## Manual alternative (no Blueprint)

Create the same four resources manually and copy the environment variables from `render.yaml`.
For the API use Docker context `.` and Dockerfile `apps/api/Dockerfile`; for the AI engine use
context `apps/ai-engine`. Set `APP_ORIGIN` and `CORS_ORIGINS` to the web URL, `AI_ENGINE_URL` to the
AI public URL, and `DATABASE_URL` from the Render database. `REDIS_URL` is optional; leave it unset
for inline scans.
