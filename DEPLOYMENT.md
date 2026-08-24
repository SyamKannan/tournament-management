# Deployment

Two supported paths. **XAMPP / MAMP** is the simplest and is covered first;
Docker Compose is there if you'd rather ship containers.

Whichever you choose, one thing is easy to miss:

> **The real-time gateway is a second process.** Apache cannot host it — it is a
> long-running socket server, not a request handler. Live scoring, auctions and
> announcements only update in real time while `php artisan websocket:serve` is
> running. The rest of the app works fine without it; screens just stop updating
> on their own.

---

## XAMPP / MAMP

### 1. Point Apache at the API

Laravel must be served from `backend/public`, never from the project root —
anything above `public/` includes your `.env`.

Add a virtual host (`httpd-vhosts.conf`):

```apache
<VirtualHost *:8000>
    DocumentRoot "/path/to/sports-saas/backend/public"

    <Directory "/path/to/sports-saas/backend/public">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

`Listen 8000` must be present in `httpd.conf`, and `mod_rewrite` enabled —
Laravel's routing depends on the `.htaccess` already in `backend/public`.

### 2. Create the database

In phpMyAdmin, create a database (`sports_saas`, collation
`utf8mb4_unicode_ci`), then point `backend/.env` at it:

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306          # MAMP often uses 8889
DB_DATABASE=sports_saas
DB_USERNAME=root
DB_PASSWORD=root      # change this

JWT_SECRET=            # php -r "echo bin2hex(random_bytes(32));"
```

### 3. Install and migrate

Use the PHP binary that ships with your stack, not the system one — that is the
one Apache runs:

```bash
# XAMPP:  /Applications/XAMPP/xamppfiles/bin/php   (or C:\xampp\php\php.exe)
# MAMP:   /Applications/MAMP/bin/php/php8.5.2/bin/php
cd backend
<php> ../composer.phar install --no-dev --optimize-autoloader
<php> artisan key:generate
<php> artisan migrate --force
<php> artisan db:seed --force      # demo data — skip for a real deployment
<php> artisan config:cache && <php> artisan route:cache
```

### 4. Start the real-time gateway

```bash
cd backend
<php> artisan websocket:serve
```

Leave it running. To keep it alive across reboots and crashes, run it under a
supervisor (`launchd` on macOS, a Windows service or NSSM, `systemd` on Linux)
rather than a terminal window.

### 5. Build and serve the front end

```bash
cd client
npm ci
VITE_WS_URL=ws://localhost:4000/ws npm run build
```

Copy `client/dist/` into your web root (`htdocs/`), and add an `.htaccess`
beside it so client-side routes survive a refresh:

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]
    RewriteRule ^ index.html [L]
</IfModule>
```

Because the SPA and the API are on different ports, set the API's allowed
origin in `backend/.env`:

```ini
CORS_ALLOWED_ORIGINS=http://localhost
```

### Checking it worked

```bash
curl http://localhost:8000/api/health          # {"status":"healthy",...}
curl http://localhost:4000/../healthz          # gateway: see below
```

The gateway's own health endpoint is on the private bridge port:

```bash
curl http://127.0.0.1:4100/health              # {"status":"healthy","connections":0,...}
```

---

## Docker Compose

```bash
cp .env.docker.example .env      # fill in APP_KEY, JWT_SECRET, DB_PASSWORD, DB_ROOT_PASSWORD
docker compose up -d --build
```

Four services: `web` (nginx serving the SPA and proxying `/api` and `/ws`),
`api`, `ws`, and `db`. Everything is one origin on `WEB_PORT`, so there is no
CORS to configure and the WebSocket upgrade works through the same host.

```bash
docker compose logs -f api
docker compose exec api php artisan migrate --force
docker compose down                 # add -v to drop the database volume
```

---

## Before going live

- [ ] `APP_DEBUG=false` and `APP_ENV=production` — debug mode leaks stack traces
      and environment values.
- [ ] `APP_KEY` and `JWT_SECRET` set to fresh random values, different per
      environment. Rotating `JWT_SECRET` signs everyone out.
- [ ] `VITE_SHOW_DEMO_ACCOUNTS` left unset, so the seeded logins and their
      passwords never render on the sign-in or landing page.
- [ ] Demo accounts removed or their passwords changed — every seeded account
      uses `12345678`.
- [ ] Skip `db:seed`, or delete the demo organizations afterwards.
- [ ] `CORS_ALLOWED_ORIGINS` narrowed from `*` to your real front-end origin.
- [ ] TLS in front of both the API and the gateway, and `VITE_WS_URL` set to
      `wss://…` — bearer tokens and bids should not cross the network in clear.
- [ ] Port **4100** (the broadcast bridge) reachable only from the API. Anything
      that can reach it can push to every connected screen.
- [ ] `POST /api/dev/reset-seed` returns 404 when `APP_ENV=production` — it wipes
      and reseeds the database, so keep it that way.
- [ ] The gateway supervised, so it comes back after a crash or reboot.
- [ ] Database backups scheduled.

## Operating notes

**Scaling.** The API is stateless and scales horizontally. The gateway holds
connections in memory, so a single instance serves all clients; to run more than
one, give them a shared backplane (Redis pub/sub) rather than load-balancing
them blind.

**Logs.** `LOG_CHANNEL=stderr` in containers. Under Apache, logs go to
`backend/storage/logs/laravel.log` — rotate it.

**Migrations.** Run from one place only. Under Compose the `api` container owns
them (`RUN_MIGRATIONS`); the `ws` container is explicitly told not to.
