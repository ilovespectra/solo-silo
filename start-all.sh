#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
orange='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color
ORANGE='\033[0;33m' 

echo -e "${ORANGE}starting silo...${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run cleanup first to remove old logs and temp data
echo -e "${ORANGE}cleaning up old logs and cache...${NC}"
bash "$SCRIPT_DIR/cleanup-startup.sh" 2>/dev/null || true

# Stop all services first to avoid duplicate instances
echo -e "${RED}stopping any existing services...${NC}"

# Kill Python processes gracefully first
pkill -TERM -f "uvicorn" 2>/dev/null || true
pkill -TERM -f "face_detection_worker" 2>/dev/null || true
sleep 1

# Force kill any remaining Python processes
pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "face_detection_worker" 2>/dev/null || true
pkill -9 -f "app.main" 2>/dev/null || true

# Kill Node/npm processes
pkill -9 -f "next.*dev" 2>/dev/null || true
pkill -9 -f "npm run dev" 2>/dev/null || true
sleep 1

# Free ports 8000 and 3000
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Final cleanup: remove any logs created during shutdown
echo -e "${ORANGE}final log cleanup...${NC}"
rm -f backend/*.log 2>/dev/null || true
rm -f *.log 2>/dev/null || true

echo -e "${ORANGE}cleanup complete. starting services...${NC}"

# Start backend in background with proper detachment
echo -e "${ORANGE}starting backend...${NC}"
cd "$SCRIPT_DIR"
# Use & and disown to completely detach, redirect all output to logs
(
  source .venv/bin/activate 
  python -m pip install -q -r backend/requirements.txt 
  cd backend 
  python -m uvicorn app.main:app --port 8000 --reload > ../backend.log 2>&1
) > /dev/null 2>&1 &
BACKEND_PID=$!
disown $BACKEND_PID 2>/dev/null || true
echo -e "${GREEN}backend started (PID: $BACKEND_PID)${NC}"
sleep 3
# Verify backend is actually running by checking if process exists
if ps -p $BACKEND_PID > /dev/null 2>&1; then
  echo -e "${GREEN}✓ backend process verified running${NC}"
else
  echo -e "${RED}❌ backend process check failed. check logs:${NC}"
  tail -20 backend.log 2>/dev/null || echo "No logs yet"
  exit 1
fi

# Wait a moment for backend to initialize
sleep 3

# Start frontend in new session (completely detached from terminal signals)
echo -e "${ORANGE}starting frontend...${NC}"
cd "$SCRIPT_DIR"
(
  npm run dev > frontend.log 2>&1
) > /dev/null 2>&1 &
FRONTEND_PID=$!
disown $FRONTEND_PID 2>/dev/null || true
echo -e "${GREEN}frontend started (PID: $FRONTEND_PID)${NC}"

# Give frontend time to start
sleep 2

echo ""
echo -e "${GREEN}✅ all services started successfully!${NC}"
echo ""
echo "backend logs:  tail -f $SCRIPT_DIR/backend.log"
echo "frontend logs: tail -f $SCRIPT_DIR/frontend.log"
echo ""
echo "To stop all services, run: ./stop-all.sh"
echo "Services are running as independent daemons and won't crash when you use this terminal."
echo ""

# Don't keep script running - services are completely detached
# This allows you to use the terminal for other commands without blocking
exit 0

wait
