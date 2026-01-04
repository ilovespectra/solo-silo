#!/bin/bash

echo "🛑 KILLING EVERYTHING..."

# Kill ALL bash subshells running auto-restart loops
ps aux | grep -E "bash.*while true" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null || true
ps aux | grep -E "sh.*while true" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null || true

# Kill ALL uvicorn and python backend processes
pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "python.*main:app" 2>/dev/null || true
pkill -9 -f "python.*app.main" 2>/dev/null || true
pkill -9 -f "python.*backend" 2>/dev/null || true
pkill -9 -f "fastapi" 2>/dev/null || true
pkill -9 -f "face_detection_worker" 2>/dev/null || true

# Kill ALL node/npm/next processes
pkill -9 -f "next.*dev" 2>/dev/null || true
pkill -9 -f "npm run dev" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
pkill -9 -f "node.*turbopack" 2>/dev/null || true

# Kill by port - 3 attempts
for i in {1..3}; do
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 0.5
done

# Final verification
sleep 1
if lsof -ti:8000 >/dev/null 2>&1 || lsof -ti:3000 >/dev/null 2>&1; then
  echo "⚠️  WARNING: Ports still in use!"
  lsof -i:8000 2>/dev/null
  lsof -i:3000 2>/dev/null
else
  echo "✅ All processes killed, ports free"
fi
