#!/bin/bash

echo "🛑 preparing ports..."

# Kill backend processes (Python/FastAPI)
pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "python.*main:app" 2>/dev/null || true
pkill -9 -f "face_detection_worker" 2>/dev/null || true
pkill -9 -f "backend/app" 2>/dev/null || true

# Kill frontend processes (Node/Next.js)
pkill -9 -f "next.*dev" 2>/dev/null || true
pkill -9 -f "turbopack" 2>/dev/null || true
pkill -9 -f "node.*3000" 2>/dev/null || true

# Kill parent shells
pkill -9 -f "start-all.sh" 2>/dev/null || true
pkill -9 -f "while true" 2>/dev/null || true

sleep 2

# Verify ports are free
BACKEND_PORT=8000
FRONTEND_PORT=3000

echo "Verifying ports..."
if netstat -tuln 2>/dev/null | grep -q ":$BACKEND_PORT "; then
  echo "⚠️  Port $BACKEND_PORT still in use, waiting..."
  sleep 2
fi

if netstat -tuln 2>/dev/null | grep -q ":$FRONTEND_PORT "; then
  echo "⚠️  Port $FRONTEND_PORT still in use, waiting..."
  sleep 2
fi

echo "✅ All processes killed, ports free"
