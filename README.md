# Linux Academy — Full Stack

A hands-on Linux/DevOps learning platform: course catalog, auth, chapters
with quizzes that gate progression, PDF certificates with public
verification, and a safe simulated lab terminal. Node/Express API backed by
SQLite, served alongside a vanilla HTML/CSS/JS frontend — no build step, no
framework, no bundler.

## Quick start (local)

```bash
npm install
cp .env.example .env        # then set JWT_SECRET (see the comment in that file)
npm run dev                 # http://localhost:3000, auto-restarts on change
```

```bash
npm test                    # runs the API test suite (node's built-in runner)
```

## Deploying

Two ready-to-use paths are included. Pick whichever matches your host.

### Docker (recommended)

```bash
cp .env.example .env        # set JWT_SECRET
docker compose up -d --build
```

The SQLite file lives in the `academy_data` named volume, so it survives
image rebuilds and `docker compose up` — but confirm your host actually
persists named volumes (a plain VPS running Docker does; many serverless
container platforms don't unless you attach a persistent disk).

### Bare VPS (systemd + nginx)

- `deploy/linux-academy.service` — systemd unit, runs the app as a
  restricted, non-root service user.
- `deploy/nginx.conf.example` — TLS-terminating reverse proxy in front of it.

Both files have setup notes at the top.

### Render

`render.yaml` defines a Render Web Service for the full application. In
Render, create a Blueprint from this repository and set the prompted
`PUBLIC_BASE_URL` value to the final Render service URL. The blueprint creates
a persistent disk mounted at `/var/data`, which keeps the SQLite database,
users, progress, and certificates across deploys.

The blueprint generates `JWT_SECRET` automatically. Do not commit a `.env`
file or replace the generated secret with a value from source control. After
the first deploy, check `/healthz`, then verify registration, login, course
enrollment, quizzes, certificates, and the lab from the public URL.

### Whichever path you use

- **Set `TRUST_PROXY`** correctly for your topology (see `.env.example`) —
  wrong values either break rate limiting or let clients spoof their IP.
- **Set `PUBLIC_BASE_URL`** to your real externally-visible URL — it's
  embedded in every certificate's verification link and QR code. The app
  refuses to boot in production without it, same as `JWT_SECRET`.
- **Persist the database.** If your platform's disk is ephemeral (wiped on
  redeploy/restart) and you don't attach a persistent volume, every deploy
  loses all users and progress. Either attach a persistent disk/volume, or
  move to a hosted Postgres/MySQL instance instead of SQLite — ask if you'd
  like that migration done.
- **Generate a real `JWT_SECRET`** — the app refuses to start in production
  without one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

## What's here

```
server/           Express app: config, db, middleware, routes, seed content
public/           Frontend — index.html, styles.css, app.js, vendor/lucide.js
test/             API + security + Phase 2 + migration tests (node --test)
deploy/           Sample nginx config + systemd unit for a non-Docker deploy
Dockerfile        Multi-stage build, non-root runtime user, healthcheck
docker-compose.yml
.github/workflows/ci.yml   Runs the test suite on every push/PR
```

## Hardened relative to the original starter

- **Security:** helmet with a real CSP, rate limiting (tighter on
  register/login), CORS opt-in only, no hardcoded JWT fallback in production,
  bcrypt cost raised to 12, timing-safe login (a failed login takes the same
  time whether or not the email exists), request size limits.
- **Correctness fixes:** opening a course now actually enrolls you (the
  original never called the enrollment endpoint, so "your courses" stayed
  empty forever); progress can no longer be recorded against a lesson that
  doesn't belong to the given course; duplicate-email registration is
  detected by the actual DB constraint instead of a catch-all.
- **XSS:** the frontend interpolated user- and course-supplied text straight
  into `innerHTML`. Everything dynamic now goes through an escaping helper,
  and inline `onclick="..."` handlers were replaced with event delegation —
  which also means the CSP above can run with no `unsafe-inline` on scripts.
  (Inline `style=""` attributes were left as-is and `style-src` still allows
  them — not a script-injection vector, and rewriting every inline style
  into a CSS class was out of scope for a hardening pass.)
- **Reliability:** centralized error handling, a `/healthz` endpoint,
  graceful shutdown on SIGTERM/SIGINT, structured JSON logs in production
  (pretty-printed in dev), WAL mode + foreign keys + indexes on SQLite.
- **Ops:** environment-validated config (fails fast if `JWT_SECRET` is
  missing in production), Docker/systemd/nginx configs, CI workflow.
- **Frontend:** CSS/JS split out of the single HTML file, lucide icons
  self-hosted instead of pointed at `unpkg.com/lucide@latest` (an unpinned
  CDN dependency), a working course search box, basic modal accessibility
  (focus on open, Escape to close, ARIA labeling).

## Phase 1 — security hardening pass

- **`/api/lab/execute` now requires auth** and is rate-limited per account
  (`LAB_RATE_LIMIT_MAX`, default 120/15min) instead of being a wide-open
  unauthenticated POST endpoint. The homepage's anonymous hero-terminal demo
  moved to a **separate `/api/lab/demo`** endpoint with a smaller, curated
  command set and its own tighter per-IP limit (`LAB_DEMO_RATE_LIMIT_MAX`,
  default 30/15min) — so the marketing "try it" experience still works for
  logged-out visitors without the full endpoint being public.
- **Progress is now gated behind enrollment**: both reading and writing
  progress for a course return `403` until the user has actually enrolled in
  it (previously only lesson-course ownership was checked).
- **Account-based login throttling** (`LOGIN_ACCOUNT_RATE_LIMIT_MAX`, default
  10/15min): failed login attempts are throttled by the *targeted email*, not
  just the caller's IP — this is what catches credential stuffing spread
  across many source IPs at one account, which pure IP-based limiting misses.
  Stacks with the existing IP-based `authLimiter`.
- **Icon allowlist hardening**: every icon name used in course/lesson seed
  data is checked against the real set of ~1,850 valid lucide icon names at
  boot (`server/utils/icons.js`, generated from the installed lucide
  version) — the app now refuses to start if a seed icon is a typo, and the
  API layer falls back to a safe default icon if a DB row is ever hand-edited
  to something invalid. This caught a real bug: the Shell & Automation course
  was seeded with `terminal-window`, which isn't a real lucide icon name and
  was silently failing to render; it's now `square-terminal`. The lab
  command allowlist also normalizes whitespace (`"ls   -la"` now matches
  `"ls -la"`) while staying case-sensitive, matching real shell behavior.
- **Cleaner malformed-request handling**: a malformed JSON body now returns
  `{"error": "Malformed JSON in request body"}` (400) instead of leaking the
  raw body-parser exception text, and a request over the 100kb body limit
  returns a clean 413 instead of an unhandled parser error.
- **New tests** (`test/security.test.js`, 11 tests): the demo-vs-full lab
  allowlist distinction, both new rate limiters actually tripping (and *not*
  cross-contaminating between different accounts), account-based login
  throttling, malformed/oversized request handling — plus additions to the
  existing suite for enrollment-gated progress and an icon-allowlist
  regression test that would have caught the `terminal-window` bug above.
  32 tests total.



## Known limitation, by design

The lab terminal is a fixed-output simulator — nothing you type actually
executes anywhere. Wiring it to real, isolated command execution (per-session
containers, network isolation, resource limits, cleanup) is a real
infrastructure project on its own and hasn't been attempted here; doing it
quickly would mean shipping an arbitrary-command-execution endpoint, which
isn't something worth improvising.

## Phase 2 — actual LMS: chapters, quizzes, certificates

Every course was restructured from a flat lesson list into
**Course → Chapter → Lesson**, with each chapter owning its own quiz:

- **Chapters are a first-class table**, ordered, each with its own quiz.
  Chapter *N* unlocks only once chapter *N−1*'s quiz has been passed;
  chapter 1 is always unlocked on enrollment.
- **Quizzes**: multiple-choice, 5 questions each, 80% to pass
  (`pass_threshold_pct` is per-quiz in the schema, not hardcoded). Retries
  are unlimited with no cooldown. Options are shuffled server-side on every
  request — the seed content always lists the correct option first for
  readability while authoring, so without shuffling it'd be positionally
  guessable. Scoring happens entirely server-side: `GET
  /api/chapters/:id/quiz` never includes which option is correct, and
  submitted answers are matched against `(question_id, option_id)` pairs, so
  pairing a valid option id with the wrong question doesn't get scored as
  correct.
- **Course completion** = every *required* chapter passed. A certificate is
  issued automatically, once, the moment that becomes true
  (`ensureCertificate` in `server/utils/courseProgress.js` is idempotent —
  safe to call from any code path that might complete a course).
- **Certificates are real PDFs** (`pdfkit` + `qrcode`, both pure JS — no
  native build step added), generated on demand from stored data rather than
  stored as blobs. Each has a `crypto.randomUUID()` verification id, a
  public `GET /api/verify/:id` (and a same-route frontend page at
  `/verify/:id`) that reveals the recipient's name, course, and issue date —
  nothing else about their account — and a `GET
  /api/certificates/:id/pdf` download. Both are intentionally unauthenticated:
  a certificate's id *is* its credential, the same way a shareable link
  works on other platforms.
- **Database migrations**: `server/db.js` now runs a small ordered migration
  system (tracked in a `migrations` table) instead of a single "create if
  not exists" pass. Upgrading a pre-Phase-2 database preserves user accounts
  and course enrollments; per-lesson completion checkmarks do not carry
  forward, because lessons now live under chapters rather than courses
  directly and there's no meaningful old id to map them onto — this is
  exercised by `test/migration.test.js` against a real constructed
  old-shape database, not just asserted.
- **New tests**: `test/phase2.test.js` (quiz access/locking, scoring
  including the cross-question-option case above, certificate issuance
  being idempotent, public verification, PDF download) and
  `test/migration.test.js`. 47 tests total across the whole suite.

## Roadmap (not yet built)

Phases 1 and 2 (above) are done. Proposed next:

- **Phase 3 — real lab infrastructure**: replace the simulator with actual
  isolated per-session Linux environments (orchestration, quotas,
  auto-destroy). A dedicated infra project — see the limitation above —
  needing a real scoping pass (target platform, per-session compute budget,
  orchestration approach) before any code gets written.
- **Phase 4 — commercial platform**: Stripe subscriptions, entitlements, and
  gating course/lab/certificate access behind them. Needs real Stripe
  test-mode credentials and a pricing model to build against.

