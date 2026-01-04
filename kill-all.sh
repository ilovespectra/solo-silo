#!/bin/bash

# Emergency script to kill ALL processes
# Comprehensive kill - ports, processes, everything

echo "🛑 Killing ALL processes on ports 8000 and 3000..."

# Round 1: Polite termination
pkill -TERM -f "uvicorn" 2>/dev/null || true
pkill -TERM -f "face_detection_worker" 2>/dev/null || true
pkill -TERM -f "next" 2>/dev/null || true
sleep 1

# Round 2: Force kill ALL process patterns
echo "  • Force killing all backend and frontend processes..."
pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "face_detection_worker" 2>/dev/null || true
pkill -9 -f "app.main" 2>/dev/null || true
pkill -9 -f "main:app" 2>/dev/null || true
pkill -9 -f "fastapi" 2>/dev/null || true
pkill -9 -f "python.*backend" 2>/dev/null || true
pkill -9 -f "python.*app/main" 2>/dev/null || true
pkill -9 -f "next.*dev" 2>/dev/null || true
pkill -9 -f "npm run dev" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
sleep 1

# Round 3: Kill by port - multiple attempts
echo "  • Killing processes on ports (3 attempts)..."
for i in {1..3}; do
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
done

# Round 4: Verify ports are actually free
if lsof -ti:8000 >/dev/null 2>&1; then
  echo "⚠️  WARNING: Port 8000 still occupied:"
  lsof -i:8000
  echo "  Attempting final kill..."
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

if lsof -ti:3000 >/dev/null 2>&1; then
  echo "⚠️  WARNING: Port 3000 still occupied:"
  lsof -i:3000
  echo "  Attempting final kill..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "✅ All processes killed"
