# ScamShield AI — UI system and page structure

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#080D18` | Page background |
| `surface` | `#101827` | Alternating sections, sidebars |
| `card` | `#151F30` | Panels, inputs |
| `primary` | `#6366F1` | Primary actions, focus rings |
| `accent` | `#06B6D4` | Data accents, links, scanner highlights |
| `success` | `#22C55E` | Low risk, verified |
| `warning` | `#F59E0B` | Moderate risk, degraded providers |
| `danger` | `#EF4444` | High/critical risk, destructive actions |
| `ink` | `#F8FAFC` | Primary text |
| `muted` | `#94A3B8` | Secondary text, labels |
| `line` | `rgba(148,163,184,0.16)` | Borders and dividers |

Typography: Geist/system sans; 12/14/16/20/24/32/48 scale. Radius `xl` 14px / `2xl` 18px. Shadows are soft and low-contrast; gradients are limited to one hero glow and one CTA. No neon glows, no bouncing animations. Motion is ≤220ms ease-out and respects `prefers-reduced-motion`.

## Component library (`components/ui`)

`button` (primary/secondary/ghost/danger/outline, sizes, loading), `card`, `input`, `textarea`, `label`, `select`, `tabs`, `badge` (risk + neutral), `alert`, `progress`, `switch`, `dialog`, `dropdown-menu`, `tooltip`, `separator`, `skeleton`, `empty-state`, `risk-badge`, `risk-gauge`, `score-bar`, `toast` (Sonner), `copy-button`, `stepper`.

Domain components (`components/scamshield`): `site-header`, `site-footer`, `scan-form` (five tabs), `finding-list`, `evidence-coverage`, `ai-explanation-panel`, `scan-result`, `scan-history-table`, `dashboard-charts`, `notification-bell`, `profile-forms`, `admin-tables`, `report-moderation`.

## Accessibility

- Every interactive element reachable by keyboard with a visible `focus-visible` ring (`primary` at 2px offset).
- Risk is never conveyed by colour alone: badge text + icon + numeric score.
- Form errors are linked with `aria-describedby`, announced via `role="alert"`.
- Minimum contrast 4.5:1 for body text on canvas/card.
- Charts include accessible tables alongside (visually hidden summary).
- `prefers-reduced-motion` disables non-essential animation.

## Page map

### Public

| Route | Content |
| --- | --- |
| `/` | Nav, hero ("Before You Trust It, Check It."), **clearly labelled illustrative** scan demo, scam categories, how it works, detection capabilities, trust principles (no fake stats/certifications), example threat analysis, pricing (Free/Plus/Business from seeded plans), FAQ, footer |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | Auth, password strength checklist, inline validation, rate-limit messaging |
| `/privacy`, `/terms` | Data handling, retention, limitations of automated detection |

### Authenticated (`(app)` layout with sidebar + topbar)

| Route | Content |
| --- | --- |
| `/dashboard` | Totals (real DB), high-risk count, risk distribution, category distribution, 14-day trend, recent scans, recent alerts, quick scan shortcuts; skeletons and empty states |
| `/scan` | Five tabs: message, URL, screenshot, QR, email; validation, per-tab guidance, progress, consent toggle for content storage, result handoff |
| `/scans` | Filterable, paginated history with type, risk badge, category, date; delete per scan and clear all |
| `/scans/[id]` | Score gauge, findings with evidence, extracted entities, evidence coverage, limitations, AI explanation panel, feedback, report CTA, QR destination warning |
| `/reports` | Submit community report, own reports with moderation status |
| `/profile` | Profile, notification preferences, privacy/retention, sessions, activity, export, password, MFA, delete account |
| `/threats` | Verified threat domains and lookup |
| `/notifications` | In-app alerts |

### Admin (`(admin)/admin`, `admin`/`moderator` only, server-side guard)

`/admin` overview, `/admin/reports` moderation, `/admin/users` roles/suspension, `/admin/threats` intel registry, `/admin/health` provider + engine health, `/admin/audit` audit trail.

## States

Every data surface ships: loading skeleton, empty state with the next useful action, error state with retry/explanation, and success toast. Uploaded files show type/size validation before submit. Long scans use a determinate step list rather than an indefinite spinner.
