#!/bin/sh
# Entrypoint for every role this image can play:
#
#   api    -> the HTTP API, served by FrankenPHP
#   ws     -> the real-time WebSocket gateway
#   queue  -> the database-driven queue worker (currently just GeneratePoster)
#
# They share an image because they share the application code; only the process
# differs. Run them as separate containers from the same build.
set -e

role="${1:-api}"

warm_caches() {
  # Config and route caches must be built after the environment is present, so
  # this belongs at boot rather than at build time.
  php artisan config:cache
  php artisan route:cache
  php artisan event:cache
}

case "$role" in
  api)
    # Only the API container touches the schema. Running migrations from both
    # roles would race them against each other.
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
      echo "→ running migrations"
      php artisan migrate --force --no-interaction
    fi

    if [ "${RUN_SEED:-false}" = "true" ]; then
      echo "→ seeding demo data"
      php artisan db:seed --force --no-interaction
    fi

    warm_caches
    echo "→ API listening on :${PORT:-8000}"
    exec frankenphp php-server \
      --listen "0.0.0.0:${PORT:-8000}" \
      --root /app/public \
      --no-compress
    ;;

  ws)
    warm_caches
    echo "→ WebSocket gateway starting on :${WEBSOCKET_PORT:-4000}"
    exec php artisan websocket:serve
    ;;

  *)
    # Anything else runs verbatim, keeping one-off maintenance commands
    # (`docker compose run api php artisan tinker`) working.
    exec "$@"
    ;;
esac
