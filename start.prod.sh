#!/bin/bash

cleanup() {
  echo "Stopping services..."
  kill $BACKEND_PID 2>/dev/null
  exit 0
}
trap cleanup EXIT INT TERM

# Kill any stale processes from previous runs
for port in 5000 8000; do
  pid=$(fuser ${port}/tcp 2>/dev/null | head -1 | xargs)
  if [ -n "$pid" ]; then
    echo "Killing stale process on port $port (PID: $pid)"
    kill $pid 2>/dev/null
    sleep 1
  fi
done

echo "Starting FastAPI backend on port 8000..."
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait until the backend health endpoint responds before starting Next.js
echo "Waiting for backend to be ready..."
for i in $(seq 1 30); do
  STATUS=$(python3 -c "
import urllib.request, sys
try:
    urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)
    print('ok')
except:
    print('not_ready')
" 2>/dev/null)
  if [ "$STATUS" = "ok" ]; then
    echo "Backend is ready (${i}s)"
    break
  fi
  sleep 1
done

# Seed database in background — runs after backend is confirmed ready
(
  echo "Checking if database needs seeding..."
  PRODUCT_COUNT=$(python3 -c "
import sys, os
sys.path.insert(0, 'backend')
try:
    from app.database import SessionLocal
    from app.models import Product
    db = SessionLocal()
    count = db.query(Product).count()
    db.close()
    print(count)
except Exception as e:
    print(0)
" 2>/dev/null || echo "0")

  if [ "$PRODUCT_COUNT" = "0" ]; then
    echo "Database is empty — seeding now (background)..."
    cd backend && python3 seed.py && cd ..
    echo "Seeding complete."
  else
    echo "Database already has $PRODUCT_COUNT products — skipping seed."
  fi
) &

echo ""
echo "========================================="
echo "  Store starting on port 5000 (production)!"
echo "========================================="
echo ""

cd frontend
exec npm run start
