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

echo "Installing Python dependencies..."
pip install -q -r backend/requirements.txt 2>/dev/null || true

if [ ! -f "backend/seller_config.json" ]; then
  echo "Seeding database..."
  cd backend && python3 seed.py && cd .. || cd ..
fi

echo "Starting FastAPI backend on port 8000..."
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

sleep 2
echo "Backend PID: $BACKEND_PID"

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd frontend && npm install && cd .. || cd ..
fi

echo ""
echo "========================================="
echo "  Store is starting on port 5000!"
echo "========================================="
echo ""

cd frontend
exec npx next dev -p 5000 -H 0.0.0.0
