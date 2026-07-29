# syntax=docker/dockerfile:1

# ── Frontend build ──────────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Runtime: Node 20 + Python 3.11 ──────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libpq5 \
    curl \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /app/frontend /app/frontend
COPY start.railway.sh /app/start.railway.sh

RUN chmod +x /app/start.railway.sh \
  && mkdir -p /data/uploads \
  && mkdir -p /app/backend/uploads

ENV NODE_ENV=production \
    PORT=5000 \
    UPLOAD_DIR=/data/uploads \
    SELLER_CONFIG_PATH=/data/seller_config.json \
    BACKEND_HOST=127.0.0.1 \
    BACKEND_PORT=8000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["/app/start.railway.sh"]
