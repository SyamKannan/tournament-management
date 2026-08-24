# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build the SPA
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines these at build time, so they are build arguments rather than
# runtime environment. VITE_SHOW_DEMO_ACCOUNTS stays false unless a demo
# deployment explicitly asks for the seeded logins to be shown.
ARG VITE_WS_URL=""
ARG VITE_SHOW_DEMO_ACCOUNTS="false"
ENV VITE_WS_URL=$VITE_WS_URL \
    VITE_SHOW_DEMO_ACCOUNTS=$VITE_SHOW_DEMO_ACCOUNTS

# `tsc -b` gates the build: a type error fails the image rather than shipping.
RUN npm run build

# ---------------------------------------------------------------------------
# Serve
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
