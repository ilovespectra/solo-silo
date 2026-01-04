#!/bin/bash

echo "🛑 KILLING EVERYTHING..."

# Round 1: Kill by port FIRST (most direct)
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Round 2: Kill ALL process patterns
pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "python.*uvicorn" 2>/dev/null || true
pkill -9 -f "python.*main:app" 2>/dev/null || true
pkill -9 -f "python.*app.main" 2>/dev/null || true
pkill -9 -f "python.*backend" 2>/dev/null || true
pkill -9 -f "fastapi" 2>/dev/null || true
pkill -9 -f "face_detection" 2>/dev/null || true
pkill -9 -f "next.*dev" 2>/dev/null || true
pkill -9 -f "npm run dev" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
pkill -9 -f "turbopack" 2>/dev/null || true

# Round 3: Kill parent shells that spawned the loops
pkill -9 -f "while true" 2>/dev/null || true
pkill -9 -f "start-all.sh" 2>/dev/null || true

# Round 4: Kill by port again (catch anything that respawned)
for i in {1..5}; do
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 0.3
done

# Final check
sleep 1
if lsof -ti:8000 >/dev/null 2>&1; then
  echo "❌ FAILED: Port 8000 still in use"
  lsof -i:8000
  exit 1
fi
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "❌ FAILED: Port 3000 still in use"
  lsof -i:3000
  exit 1
fi

echo "✅ All processes killed, ports free"
