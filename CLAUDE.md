# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Use fewer tokens and get a good product: read only what's needed, act, avoid narration.

## What this is

Multi-organization platform for running village/club sports tournaments (football and cricket) —
live scoring, big-screen scoreboards, player auctions, ground-fee collection, and
per-organizer subscriptions.

```
backend/   Laravel 13 API + real-time WebSocket gateway
client/    React 19 + Vite SPA
server/    old Express/TypeScript backend — dead, not used
```

## Commands

```bash
npm run setup       # composer install + migrate:fresh --seed + client npm install
npm run dev         # API :8000, WebSocket gateway :4000, queue worker, client :5173 (concurrently)
npm test            # backend/php artisan test — the only test suite
npm run db:reset    # migrate:fresh --seed, restores demo dataset
npm run build       # production client bundle
```

Single test / single suite (from `backend/`):

```bash
php artisan test --filter=AuctionTest
php artisan test tests/Feature/CricketScoringTest.php
php artisan test --filter=test_undo_last_football_event
```

Client-only:

```bash
cd client
npm run dev         # vite only, no API/WS
npm run typecheck   # tsc -b --force
npm run build       # tsc -b && vite build
```

`npm run dev` at the root always starts all four processes together — there is no
root-level flag to run just one; use the per-package scripts above for that. The queue
worker (`database` queue connection) runs `GeneratePoster` and `SendNotification`, so
skipping it leaves posters ungenerated and messages sitting at `queued`.

**Scheduler.** `routes/console.php` holds the schedule; deployment needs one cron entry
(`* * * * * php artisan schedule:run`). Every task is safe to run twice — the sweeps
dedupe on `notifications.dedupe_key` and act only on rows whose dates say so, so a missed
hour catches up and a double run sends nothing twice.

| Command | When | Does |
| --- | --- | --- |
| `notifications:reminders` | every 15 min | match reminders (24h, 2h) and weekly unpaid-fee reminders |
| `notifications:retry` | every 10 min | re-queues failed sends still under `max_attempts` |
| `subscriptions:sweep` | 06:30 daily | expires subscriptions past `end_date` + `grace_period_days`, warns before |

Both sweeps take `--dry-run`.

## Architecture

**Tenancy.** Every record belongs to an organization. `ResolveApiUser` middleware runs
on *every* request and identifies the caller without ever rejecting it (public
tournament hubs, registration links, and stadium scoreboards must work anonymously).
Access is then enforced per-route by separate middleware: `auth.required` (401),
`role:SUPER_ADMIN` (403), `tenant` / `tenant:id` (403 on cross-org access, and logs the
attempt to the audit trail via `app/Support/Audit.php`). Super admins are platform-wide
and bypass tenant checks.

**Auth.** Two accepted credentials: `Authorization: Bearer <jwt>` (HS256, 7-day expiry,
`JWT_SECRET`) and the `x-demo-role` / `x-demo-org-id` header pair used by the client's
role switcher (no login needed in dev). `TokenService` issues/verifies JWTs, and
`authenticate()` is the only way in — it applies both revocation paths, so don't check a
token with bare `decode()`:
- one token, by its `jti`, denylisted in `revoked_tokens` (`POST /api/auth/logout`, and
  ending an impersonation — the client calls logout while still holding the borrowed
  token). Spent rows are pruned on write; there is no scheduler to sweep them.
- every token an account holds, by `users.token_version` (`POST /api/auth/logout-everywhere`,
  a password change, and suspending an organization). A counter, not a timestamp, because
  `iat` is second-accurate and can't separate the token revoked from the replacement issued
  right after. A password change returns a fresh `token` — the client must adopt it.

Tokens predating this carry no `jti`/`tv`; they read as version 0 and stay valid until
something revokes them.

**Notifications (WhatsApp / SMS).** `NotificationService` is the only way out.
`dispatch()` runs inside the web request and does nothing slow: it renders the template,
writes a `notifications` row and queues `SendNotification`. `deliver()` runs on the queue
and hands the row to a driver. Nothing throws into the caller — a gateway outage must not
fail a team approval, same rule as `RealtimeBroadcaster`.
- Message wording lives in `NotificationCatalog` (one place, SMS-length aware). Recipients
  come from `Audience` — never re-derive which of a team's four contact columns to use.
- Drivers implement `Channels\ChannelDriver` and are registered in `ChannelManager`:
  `log` (default — records instead of sending), `twilio` (SMS + WhatsApp) and
  `meta_whatsapp` (Cloud API; map events to approved templates in
  `notifications.whatsapp_templates`). A `log` send is stored as `sent`, so anything
  user-facing must ask `ChannelManager::isSimulated()` — the org log flags those rows
  "Recorded, not delivered", and `GET /api/admin/notification-health` puts a `log` driver in
  production in front of the super admin (password reset codes can't reach anyone).
- Scheduled messages pass a `dedupeKey`; the unique index turns at-least-once scheduling
  into exactly-once delivery. Always pass one from a command.
- Per-org switches live in `organizations.notification_settings`; `config('notifications.defaults')`
  applies until an organizer changes them. `notification_opt_outs` is checked at dispatch
  *and* at delivery, so opting out after queueing still stops the send.
- Phone numbers go through `Support\Phone::normalize()` (E.164, India assumed for bare
  10-digit) — that is what makes opt-out matching work regardless of how it was typed.

**Fixtures and brackets.** `Fixtures\FixtureBuilder` builds the whole schedule for four
formats — `league` (optionally home and away), `knockout`, `group_stage`, `league_knockout`.
It hands work to `Fixtures\Slotter` as *rounds* (sets of fixtures in which no team appears
twice), which is what lets a matchday spread across every `venues` row without clashing a
team or double-booking a ground. Keep that contract: a builder that emits a flat list
breaks both guarantees.
- A knockout creates **every round up front**, later ones with empty `team_a_id`/`team_b_id`
  and an `advance_from` saying what fills them (`winner` of a match, or a `group` position).
  Seeds go in in *seeding order* and the bracket pairs them — pre-pairing the list gets
  re-permuted into same-group ties. Byes are real rows, already `completed`.
- `Fixtures\BracketService::sync()` **recomputes** progression from `advance_from` rather
  than tracking it, so undoing a semi-final takes the wrong finalist back out. It is called
  from `ScoringEngine::rankStandings()` — the one place every result change passes through.
  It will not touch a match that has already started.
- Group qualifiers are read off `standings.rank` only once every fixture in that group is
  finished, so a half-played group never seeds a semi-final.
- `FixtureBuilder` also writes `teams.group_name`; the tournament table is grouped by it.
- `GET /api/matches/bracket/{idOrSlug}` is public (hub + stadium screen); a league returns
  `has_bracket: false`.

**Account recovery.** `POST /api/auth/forgot-password` then `/reset-password`, with a
six-digit code sent by **SMS** through the notification engine — most of these users have
no email. `PasswordResetService` answers identically whether or not the account exists (the
endpoint would otherwise enumerate which phone numbers are registered); the code is stored
hashed, expires in 15 minutes and burns after `PasswordReset::MAX_ATTEMPTS` wrong guesses.
A successful reset revokes every session and returns a working token.
When the SMS can't arrive, `TemporaryPasswordService` issues a one-time password —
`POST /api/admin/users/{id}/reset-password` (super admin) or
`/api/organizations/{id}/members/{userId}/reset-password` (organizer; not for other admins).
It sets `users.must_change_password`, which the client's `MustChangePasswordGate` enforces
at sign-in. Onboarding a club works the same way: no default password, and the response
carries `admin_credentials` exactly once.

**Errors reach people as sentences.** `App\Exceptions\ApiExceptionRenderer` renders every
API exception as `{error, message, code, errors?}` — `error` is the first human-readable
message, `errors` the per-field map on a 422 (the client's `useFieldErrors` shows it under
the field). Controllers keep returning `['error' => '…']`; never let a bare status code
reach the client.

**Lists are paged on the server.** Use `App\Support\Paginate` (`query()`, `search()`) for
anything that grows — envelope `{data, page, per_page, total, total_pages, has_more}`,
searched in SQL. Don't `->get()` a whole table for a list screen, and don't cap with
`limit(50)` and let the browser filter. Client side: `usePaginatedList` + `<Pager>`.

**Rate limiting.** Use a **named** limiter from `AppServiceProvider::registerRateLimiters()`
for anything that needs a real budget. An inline `throttle:5,10` keys on route+IP — the same
key the global `throttleApi` uses — so both middlewares increment one counter and a request
costs two attempts. `throttle:5,10` actually allows about 2.

**Storage quota.** `plans.storage_limit_mb` is measured off the `uploads` table
(`BillingService::storageUsedMb`), enforced in `UploadController` and reported by
`usage()`. Only uploads with an `organization_id` count: uploading is public (registration
sends a photo before anyone has an account), and a team must never be turned away from
registering because the club is near its limit.

**Exports.** `ExportController` + `CsvWriter`. Public files (table, fixtures, player stats,
one match's card) match what the hub already shows; fee collection and squad lists carry
phone numbers and stay with the organizer. `CsvWriter` writes a UTF-8 BOM and prefixes
anything Excel would reinterpret — a leading `=` (CSV injection) or an 11+ digit number
(scientific notation). The scorecard is printable HTML, not a rendered PDF, to keep headless
Chrome off a download path.

**Two separate money flows — don't conflate them.**
- `BillingService` — what organizers pay the platform (plans, limits, subscriptions,
  invoices, MRR).
- `TournamentPaymentService` — what teams pay organizers to enter a tournament (ground
  fees, partial payments, receipts).

**Live scoring.** `ScoringEngine` keeps one mutable state row per match plus an
append-only event log (`football_events`, `cricket_deliveries` tables — real rows, not
JSON, specifically so undo is "delete last row and reverse its effect"). Each action
writes to the log, folds into state, updates career stats, and recomputes the
tournament table. The log tables are re-serialized into `events` / `deliveries` /
`bid_history` arrays in API responses, so response shape stays stable regardless of
storage.

**Player stats are never stored.** `PlayerStatsService` derives every number (runs,
wickets, goals, matches, clean sheets, player-of-the-match awards) from the scoring logs,
`match_lineups` and `matches` on each read, a tournament at a time. So undo and
cancellation need no stats bookkeeping — don't add counters back to `ScoringEngine`. The
public read-only API is `GET /api/players/search?q=` (the no-login "Player Stats" page at
`/players`), `GET /api/players/{id}/profile|matches|career` and
`/api/players/tournament/{idOrSlug}/stats|leaderboard` (throttled, no mobile/dob/age,
draft tournaments 404). Careers join squad entries through the user account (id or phone).

**AI assistant (Scorey).** `POST /api/assistant/chat` (public, `throttle:10,1`) — `AssistantService` runs a model
tool loop over raw HTTP: Gemini when `GEMINI_API_KEY` is set (free tier, `GEMINI_MODEL`), else Claude via
`ANTHROPIC_API_KEY` (`ASSISTANT_MODEL`). Both share one tool list, whose tools
read only public data: non-draft tournaments, and the public `PlayerController`/`MatchController` actions.
Never give a tool contact fields (phones, emails, addresses). "How does KickWick work" answers come from the
platform guide in its `SYSTEM_PROMPT` — update it when a user-facing flow changes. No key → 503; widget is
`client/src/components/AssistantChat.tsx`, history kept in sessionStorage.

**Real-time gateway** (`php artisan websocket:serve`, `app/Console/Commands/WebSocketServe.php`)
is a standalone Workerman process, separate from the API, holding two listeners on one
event loop (must be one process — they share one `Hub` registry):
- `ws://0.0.0.0:4000/ws` — browsers connect and `SUBSCRIBE`/`UNSUBSCRIBE` to rooms:
  `match:<id>`, `scoreboard:<id>`, `auction:<id>`.
- `http://127.0.0.1:4100` — loopback-only bridge the API posts events to; never expose
  this port publicly, anything that reaches it can broadcast to every connected screen.

`RealtimeBroadcaster` (in `app/Services/`) posts to the bridge with a short timeout and
swallows failures on purpose — scoring/bidding/announcements must keep returning normal
API responses even when the gateway is down or unreachable. Don't make broadcast calls
blocking or failure-sensitive.

**Data model.** 25 tables, human-readable string primary keys (`org-green-valley`,
`tourney_1724500000000`) because public share links and the client depend on them being
stable and readable — don't switch these to auto-increment ints. Structured config
(tournament settings, payment rules, plan features, auction base prices, receipt
snapshots, career stats) lives in JSON columns cast to arrays; things that need ordered
undo/append semantics (`football_events`, `cricket_deliveries`, `auction_bids`) are real
tables instead.

**Layout inside `backend/`:**
```
app/Http/Controllers/Api/   one controller per resource
app/Http/Middleware/        ResolveApiUser, RequireAuth, RequireRole, RequireTenantAccess
app/Models/                 Eloquent models, string PKs
app/Services/               billing, ground fees, scoring, auctions, stats, realtime, tokens
app/Support/                Ids (id/slug generation), Audit (audit trail)
app/WebSocket/Hub.php       room registry for the gateway
database/migrations/        4 grouped migrations, 25 tables total
database/seeders/data/seed.json   the demo fixture (passwords in clear, hashed on seed)
routes/api.php               the entire route table, single file
```

**Client conventions for people on a ground.**
- Theme, text size and language live in `src/i18n` (`PreferencesProvider`, `useT`,
  `en.ts`/`ml.ts`). The light theme re-points Tailwind's colour variables in `src/theme.css`,
  so keep using `slate-*`/`text-white` tokens, not hex. TV screens and photo heroes are dark
  islands (`data-theme="dark"`). A new accent *text* shade needs a rule in `theme.css`.
- Anything that commits money or a score goes through `useSingleFlight` (a ref guard — a
  disabled button alone lets a same-frame double tap through) and awaits its refetch.
- Long public forms keep a device draft (`useDraft`, `useLeaveWarning`).
- Screens nobody touches for minutes (scorer, scoreboard and auction TV) call `useWakeLock`.
- Auction: `POST /api/auctions/{id}/reopen-hammer` undoes the latest sold/unsold call while
  that player is still on the hammer (refused once paid for or named in a lineup).
- Team registration calls `…/registration/{token}/validate` *before* opening checkout; a
  resubmitted paid registration is replayed (`replayed: true`); a paid-but-refused one is
  audited as `REGISTRATION_PAYMENT_NEEDS_REFUND`.
- Razorpay's script loads on demand (`utils/razorpay.ts`), never as a blocking tag.

## Config

| Variable | Default | Notes |
| --- | --- | --- |
| `DB_CONNECTION` | `sqlite` | `mysql`/`pgsql` work with no code changes |
| `JWT_SECRET` | dev fallback | must be set per environment |
| `WEBSOCKET_PORT` | `4000` | public gateway |
| `WEBSOCKET_BRIDGE_PORT` | `4100` | loopback only, never expose |
| `CORS_ALLOWED_ORIGINS` | `*` | narrow before deploying |
| `FRONTEND_URL` | request `Origin`, then `APP_URL` | client origin for the registration QR on posters |
| `NOTIFICATIONS_ENABLED` | `true` | off queues nothing at all — set it on any copy of production data |
| `WHATSAPP_DRIVER` / `SMS_DRIVER` | `log` | `log`, `twilio` or `meta_whatsapp`; `log` in production means reset codes never arrive |
| `TWILIO_*`, `META_WHATSAPP_*` | — | gateway credentials, see `backend/.env.example` |

Demo login for any seeded account: password `12345678` (see root README for the account
list). `POST /api/dev/reset-seed` wipes and reseeds the DB and must 404 in production
(`APP_ENV=production` already enforces this — keep it that way).

## Tests

`backend/tests/Feature/`: `TenantIsolationTest`, `AuthTest`, `BillingTest`,
`GroundFeePaymentTest`, `FootballScoringTest`, `CricketScoringTest`, `AuctionTest`,
`AuctionAuthorizationTest`, `AuctionPaymentReportTest`, `ApiContractTest` (JSON shape
every client screen depends on — update this when changing response shapes),
`RealtimeResilienceTest` (behavior with gateway down), `WebSocketHubTest`,
`ExportAndRecoveryTest` (CSV escaping, password-reset flow and its limits, storage quota,
standings tie-breakers),
`TokenRevocationTest` (both revocation paths), `TournamentSettingsTest` (settings actually
reaching the scoring engine), `NotificationEngineTest` (templates, opt-outs, per-org
switches, both scheduled sweeps and their dedupe), `BracketTest` (seeding, byes,
progression and its undo, groups feeding a bracket, ground clashes, venue CRUD),
`HumanFacingFixesTest` (error envelope, delivery honesty and drivers, temporary passwords,
paging and search, auction undo, pay-then-register safety, poster job status).


No client-side test suite exists — `npm run typecheck` is the only automated client
check.
