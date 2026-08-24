# Antigravity Sports SaaS

Multi-tenant platform for running village and club sports tournaments — football and
cricket — with live scoring, big-screen scoreboards, player auctions, ground-fee
collection and per-organizer SaaS subscriptions.

```
backend/   Laravel 13 API + real-time WebSocket gateway
client/    React 19 + Vite SPA (unchanged by the backend migration)
server/    the previous Express/TypeScript backend — no longer used
```

## Requirements

- PHP 8.2+ with `pdo_sqlite`, `pcntl`, `posix`, `sockets`
- Composer 2
- Node 20+

## Getting started

```bash
npm run setup     # composer install + database + client dependencies
npm run dev       # API :8000, WebSocket :4000, client :5173
```

Open <http://localhost:5173>.

`npm run dev` runs three processes:

| Process | Port | What it is |
| --- | --- | --- |
| `dev:api` | 8000 | `php artisan serve` — the REST API under `/api` |
| `dev:ws` | 4000 | `php artisan websocket:serve` — the live gateway at `/ws` |
| `dev:client` | 5173 | Vite dev server, proxying `/api` to port 8000 |

Other scripts: `npm test` (the backend suite), `npm run db:reset` (restore the demo
dataset), `npm run build` (production client bundle).

## Demo accounts

Every seeded account uses the password **`12345678`**.

| Role | Email |
| --- | --- |
| Super admin | `syamdas@gmail.com` |
| Organization admin | `admin@greenvalley.com` |
| Organization admin | `admin@malabar.com` |
| Scorer | `scorer@greenvalley.com` |
| Team manager | `manager@malabarblasters.com` |
| Player | `shameer.player@gmail.com` |

The client can also switch roles without signing in by sending `x-demo-role` (and
optionally `x-demo-org-id`) headers.

## How it fits together

**Tenancy.** Every record belongs to an organization. The `tenant` middleware works
out which organization a request is reaching for — from the URL, the body, or by
resolving the owner of the tournament, team or match being addressed — and refuses
anything that crosses a boundary, writing the attempt to the audit trail. Super
admins are platform-wide.

**Two separate money flows.** `BillingService` handles what organizers pay the
platform: plans, limits, subscriptions, invoices, MRR. `TournamentPaymentService`
handles what teams pay organizers to enter a tournament: ground fees, partial
payments and receipts.

**Live scoring.** `ScoringEngine` keeps one mutable state row per match plus an
append-only log — football events, cricket deliveries. Each action writes to the log,
folds its effect into the state, updates career statistics and recomputes the
tournament table, which makes undo a matter of dropping the last entry and reversing
it.

**Real-time.** The gateway is a standalone Workerman process holding the browser
sockets. Clients subscribe to rooms (`match:<id>`, `scoreboard:<id>`,
`auction:<id>`); the API pushes events to it over a loopback bridge on port 4100.
Delivery is best-effort on purpose — scoring, bidding and announcements keep working
and keep returning normal responses when the gateway is down.

See [backend/README.md](backend/README.md) for the API reference, schema and
deployment notes.

## Database

SQLite by default, so a fresh clone runs with no database server. To use MySQL or
Postgres, set `DB_CONNECTION` and the connection variables in `backend/.env`, then
run `npm run db:reset`. No application code changes are needed.

## Tests

```bash
npm test
```

89 tests covering tenant isolation, authentication, plan limits, ground-fee
collection, both scoring engines, the auction lifecycle, the real-time contract, and
the JSON shape of every endpoint the client depends on.
