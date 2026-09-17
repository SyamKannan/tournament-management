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
worker (`database` queue connection) exists for `GeneratePoster`; nothing else in the
app queues jobs, so skipping it only breaks poster generation.

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
role switcher (no login needed in dev). `TokenService` issues/verifies JWTs.

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
Never give a tool contact fields (phones, emails, addresses). "How does Sportivo work" answers come from the
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

## Config

| Variable | Default | Notes |
| --- | --- | --- |
| `DB_CONNECTION` | `sqlite` | `mysql`/`pgsql` work with no code changes |
| `JWT_SECRET` | dev fallback | must be set per environment |
| `WEBSOCKET_PORT` | `4000` | public gateway |
| `WEBSOCKET_BRIDGE_PORT` | `4100` | loopback only, never expose |
| `CORS_ALLOWED_ORIGINS` | `*` | narrow before deploying |
| `FRONTEND_URL` | request `Origin`, then `APP_URL` | client origin for the registration QR on posters |

Demo login for any seeded account: password `12345678` (see root README for the account
list). `POST /api/dev/reset-seed` wipes and reseeds the DB and must 404 in production
(`APP_ENV=production` already enforces this — keep it that way).

## Tests

`backend/tests/Feature/`: `TenantIsolationTest`, `AuthTest`, `BillingTest`,
`GroundFeePaymentTest`, `FootballScoringTest`, `CricketScoringTest`, `AuctionTest`,
`AuctionAuthorizationTest`, `AuctionPaymentReportTest`, `ApiContractTest` (JSON shape
every client screen depends on — update this when changing response shapes),
`RealtimeResilienceTest` (behavior with gateway down), `WebSocketHubTest`.

No client-side test suite exists — `npm run typecheck` is the only automated client
check.
