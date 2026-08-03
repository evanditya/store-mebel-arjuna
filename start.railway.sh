#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"
export SELLER_CONFIG_PATH="${SELLER_CONFIG_PATH:-/data/seller_config.json}"
mkdir -p "$UPLOAD_DIR"
mkdir -p "$(dirname "$SELLER_CONFIG_PATH")"

PORT="${PORT:-5000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

cleanup() {
  echo "Stopping services..."
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup EXIT INT TERM

echo "Starting FastAPI on ${BACKEND_HOST}:${BACKEND_PORT}..."
cd "$ROOT_DIR/backend"
python -m uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" &
BACKEND_PID=$!
cd "$ROOT_DIR"

# Wait for backend health
for i in $(seq 1 30); do
  if python -c "import urllib.request; urllib.request.urlopen('http://${BACKEND_HOST}:${BACKEND_PORT}/api/health', timeout=1)" 2>/dev/null; then
    echo "Backend is healthy."
    break
  fi
  sleep 1
done

(
  echo "Checking if database needs seeding..."
  PRODUCT_COUNT=$(cd "$ROOT_DIR/backend" && python -c "
import sys
try:
    from app.database import SessionLocal
    from app.models import Product
    db = SessionLocal()
    count = db.query(Product).count()
    db.close()
    print(count)
except Exception as e:
    print(f'ERR:{e}', file=sys.stderr)
    print(0)
" 2>/dev/null || echo "0")

  if [ "$PRODUCT_COUNT" = "0" ]; then
    echo "Database is empty — seeding..."
    cd "$ROOT_DIR/backend" && python seed.py
    echo "Seeding complete."
  else
    echo "Database already has $PRODUCT_COUNT products — skipping seed."
  fi

  # Drop gallery/description images that belong to another scrape product index
  echo "Sanitizing cross-product images..."
  cd "$ROOT_DIR/backend" && python fix_product_images.py || echo "Image sanitize skipped."
) &

echo "Starting Next.js on 0.0.0.0:${PORT}..."
cd "$ROOT_DIR/frontend"
exec npx next start -H 0.0.0.0 -p "$PORT"
