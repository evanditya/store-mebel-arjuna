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

if [ ! -f ".env" ]; then
  echo "Generating .env file..."
  JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || echo "change-me-$(date +%s)")
  cat > .env << ENVEOF
DATABASE_URL=${DATABASE_URL:-postgresql://user:password@localhost:5432/store}
JWT_SECRET=$JWT_SECRET
MIDTRANS_SERVER_KEY=${MIDTRANS_SERVER_KEY:-}
MIDTRANS_CLIENT_KEY=${MIDTRANS_CLIENT_KEY:-}
MIDTRANS_IS_PRODUCTION=${MIDTRANS_IS_PRODUCTION:-false}
BITESHIP_API_KEY=${BITESHIP_API_KEY:-}
ENVEOF
  echo ".env file created"
fi

if [ -n "$DATABASE_URL" ]; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" .env 2>/dev/null || true
fi
if [ -n "$MIDTRANS_SERVER_KEY" ]; then
  sed -i "s|^MIDTRANS_SERVER_KEY=.*|MIDTRANS_SERVER_KEY=$MIDTRANS_SERVER_KEY|" .env 2>/dev/null || true
fi
if [ -n "$MIDTRANS_CLIENT_KEY" ]; then
  sed -i "s|^MIDTRANS_CLIENT_KEY=.*|MIDTRANS_CLIENT_KEY=$MIDTRANS_CLIENT_KEY|" .env 2>/dev/null || true
fi
if [ -n "$MIDTRANS_IS_PRODUCTION" ]; then
  sed -i "s|^MIDTRANS_IS_PRODUCTION=.*|MIDTRANS_IS_PRODUCTION=$MIDTRANS_IS_PRODUCTION|" .env 2>/dev/null || true
fi
if [ -n "$BITESHIP_API_KEY" ]; then
  sed -i "s|^BITESHIP_API_KEY=.*|BITESHIP_API_KEY=$BITESHIP_API_KEY|" .env 2>/dev/null || true
fi

set -a
source .env 2>/dev/null || true
set +a

echo "Installing Python dependencies..."
pip install -q -r backend/requirements.txt 2>/dev/null || pip install --user -q -r backend/requirements.txt 2>/dev/null || true

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
