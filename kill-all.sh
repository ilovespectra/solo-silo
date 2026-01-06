#!/bin/bash

echo "🛑 Aggressively killing all indexing and face detection processes..."

# AGGRESSIVE: Kill Python processes by pattern (multiple attempts)
for i in {1..3}; do
  echo "  [Attempt $i] Killing Python processes..."
  pkill -9 -f "python" 2>/dev/null || true
  pkill -9 python 2>/dev/null || true
  pkill -9 python3 2>/dev/null || true
  sleep 0.5
done

# Kill specific process patterns
pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "main:app" 2>/dev/null || true
pkill -9 -f "fastapi" 2>/dev/null || true
pkill -9 -f "face_detection" 2>/dev/null || true
pkill -9 -f "indexer" 2>/dev/null || true
pkill -9 -f "backend/app" 2>/dev/null || true
pkill -9 -f "clustering" 2>/dev/null || true

# Kill Node/Next.js processes
pkill -9 -f "next.*dev" 2>/dev/null || true
pkill -9 -f "turbopack" 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true

# Kill parent shell scripts
pkill -9 -f "start-all.sh" 2>/dev/null || true
pkill -9 -f "while true" 2>/dev/null || true

# Final aggressive sweep - kill ALL Python and Node
killall -9 python 2>/dev/null || true
killall -9 python3 2>/dev/null || true
killall -9 node 2>/dev/null || true

sleep 2

echo "✅ All processes terminated aggressively"
