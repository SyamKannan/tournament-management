# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Composer dependencies
# ---------------------------------------------------------------------------
FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./

# Scripts are skipped here because artisan is not in this layer yet.
RUN composer install \
      --no-dev \
      --no-scripts \
      --no-autoloader \
      --prefer-dist \
      --no-interaction

COPY . .
RUN composer dump-autoload --optimize --classmap-authoritative

# ---------------------------------------------------------------------------
# Runtime
#
# FrankenPHP is a real application server (unlike php -S, which is a dev tool)
# and ships as a single binary, so the API and the WebSocket gateway can run
# from one image with different entrypoint roles.
# ---------------------------------------------------------------------------
FROM dunglas/frankenphp:1-php8.3-alpine AS runtime

# pcntl, posix and sockets are what the WebSocket gateway needs; pdo_mysql and
# pdo_pgsql cover the supported databases.
RUN install-php-extensions \
      pcntl \
      posix \
      sockets \
      pdo_mysql \
      pdo_pgsql \
      intl \
      opcache \
      zip

RUN { \
      echo 'opcache.enable=1'; \
      echo 'opcache.enable_cli=0'; \
      echo 'opcache.memory_consumption=192'; \
      echo 'opcache.max_accelerated_files=20000'; \
      echo 'opcache.validate_timestamps=0'; \
    } > /usr/local/etc/php/conf.d/opcache.ini \
 && { \
      echo 'memory_limit=512M'; \
      echo 'upload_max_filesize=12M'; \
      echo 'post_max_size=12M'; \
      echo 'expose_php=Off'; \
    } > /usr/local/etc/php/conf.d/app.ini

WORKDIR /app

COPY --from=vendor /app /app

# The application only ever writes to these two trees.
RUN adduser -u 1000 -D -S -G www-data app \
 && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
 && chown -R app:www-data storage bootstrap/cache \
 && chmod -R 775 storage bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

USER app

# 8000 — HTTP API. 4000 — WebSocket gateway.
EXPOSE 8000 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD php -r "exit(@file_get_contents(getenv('HEALTHCHECK_URL') ?: 'http://127.0.0.1:8000/api/health') ? 0 : 1);"

ENTRYPOINT ["entrypoint"]
CMD ["api"]
