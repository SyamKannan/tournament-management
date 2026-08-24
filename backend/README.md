# Backend — Laravel API & real-time gateway

Laravel 13 REST API under `/api`, plus a standalone WebSocket gateway for live
scoring, auctions and announcements.

## Running

```bash
composer install
php artisan migrate:fresh --seed      # demo dataset
php artisan serve --port=8000         # API
php artisan websocket:serve           # gateway on :4000, bridge on :4100
php artisan test
```

Both processes are needed for the full experience; the API works on its own, it just
cannot push live updates.

## Layout

```
app/
  Console/Commands/WebSocketServe.php   the gateway process
  Http/Controllers/Api/                 one controller per resource
  Http/Middleware/                      ResolveApiUser, RequireAuth, RequireRole, RequireTenantAccess
  Models/                               29 Eloquent models over string primary keys
  Services/                             billing, ground fees, scoring, auctions, stats, realtime, tokens
  Support/                              Ids (identifier + slug generation), Audit (audit trail)
  WebSocket/Hub.php                     room registry for the gateway
database/
  migrations/                           four grouped migrations, 25 tables
  seeders/data/seed.json                the demo fixture
routes/api.php                          the whole route table
```

## Authentication

`ResolveApiUser` runs on every API request and identifies the caller **without ever
rejecting one** — public tournament hubs, registration links and stadium scoreboards
must stay reachable anonymously. Access is enforced per route:

| Middleware | Effect |
| --- | --- |
| `auth.required` | 401 unless a caller was resolved |
| `role:SUPER_ADMIN` | 403 unless the caller holds one of the listed roles |
| `tenant` | 403 on any cross-organization access, and audits the attempt |
| `tenant:id` | same, when the organization is the named route parameter |

Two credentials are accepted: `Authorization: Bearer <jwt>` (HS256, seven-day expiry,
signed with `JWT_SECRET`), and the `x-demo-role` / `x-demo-org-id` header pair used by
the role switcher.

Passwords are bcrypt-hashed. The fixture stores demo passwords in the clear so they
stay readable, and the seeder hashes them on the way into the database.

## Data model

25 tables. Primary keys are human-readable strings (`org-green-valley`,
`tourney_1724500000000`) because public share links and the client depend on them.

Structured configuration — tournament settings, payment rules, plan features, auction
base prices, receipt snapshots, career statistics — is stored in JSON columns and cast
to arrays. Things that are genuinely rows are rows: `football_events`,
`cricket_deliveries` and `auction_bids` each have their own ordered table rather than
living as a JSON blob, which is what makes undo a single ordered delete. They are
re-serialised into the `events`, `deliveries` and `bid_history` arrays the API returns,
so the response shape is unchanged.

## Real-time gateway

`php artisan websocket:serve` runs one process holding two listeners on a shared event
loop:

- **`ws://0.0.0.0:4000/ws`** — browsers connect here
- **`http://127.0.0.1:4100`** — the API posts events here; `/health` reports live
  connection and room counts

Both listeners must live in the same process because they share one `Hub`; the bridge
is opened with `listen()` from inside the WebSocket worker rather than as a second
`Worker`, which Workerman would fork into a process of its own.

The wire protocol is plain JSON, so the browser needs no client library:

```jsonc
// client → gateway
{ "type": "SUBSCRIBE",   "room": "match:match-fb-live-1" }
{ "type": "UNSUBSCRIBE", "room": "match:match-fb-live-1" }
{ "type": "PING" }

// gateway → client
{ "type": "SCORE_UPDATED", "room": "match:...", "payload": { … }, "timestamp": 1724500000000 }
```

Rooms in use: `match:<id>` (scorer consoles), `scoreboard:<id>` (stadium displays),
`auction:<id>` (bidding room and auction TV). Announcements are broadcast globally.

`RealtimeBroadcaster` posts to the bridge with a short timeout and swallows failures,
so an unreachable gateway never turns a successful score into a failed request.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_CONNECTION` | `sqlite` | `mysql` / `pgsql` also work unchanged |
| `JWT_SECRET` | dev fallback | **Set a long random value per environment** |
| `JWT_TTL_SECONDS` | `604800` | Token lifetime |
| `WEBSOCKET_PORT` | `4000` | Public gateway port |
| `WEBSOCKET_BRIDGE_PORT` | `4100` | Loopback bridge — never expose publicly |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-separated; narrow before deploying |

## Before deploying

- Set a real `JWT_SECRET` and `APP_KEY`; `APP_DEBUG=false`, `APP_ENV=production`.
- Narrow `CORS_ALLOWED_ORIGINS` to your actual front-end origins.
- Keep port 4100 bound to loopback — anything that can reach it can broadcast to
  every connected screen.
- `POST /api/dev/reset-seed` wipes and reseeds the database. It already returns 404
  when `APP_ENV=production`; leave it that way.
- Run the gateway under a supervisor (systemd, Supervisor) so it restarts on failure,
  and put TLS in front of it for `wss://`.

## Tests

```bash
php artisan test
```

| Suite | Covers |
| --- | --- |
| `TenantIsolationTest` | Cross-organization refusals and audit logging |
| `AuthTest` | Login, JWT round trip, demo headers, signup, password hashing |
| `BillingTest` | Plan limits, feature gating, usage, subscriptions, MRR |
| `GroundFeePaymentTest` | Partial and full payments, receipts, squad validation |
| `FootballScoringTest` | Goals, own goals, cards, undo, full time |
| `CricketScoringTest` | Runs, extras, wickets, strike rotation, innings, chases |
| `AuctionTest` | Pool registration, hammer, bid limits, sale, accelerated round |
| `ApiContractTest` | The JSON shape every client screen depends on |
| `RealtimeResilienceTest` | Correct rooms, and graceful behaviour with no gateway |
| `WebSocketHubTest` | Room routing, global broadcast, disconnect cleanup |
