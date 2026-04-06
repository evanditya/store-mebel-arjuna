#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Project root: $ROOT_DIR"

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
cd "$ROOT_DIR/backend"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

echo "Starting Next.js on port 5000..."
cd "$ROOT_DIR/frontend"
exec npm run start
