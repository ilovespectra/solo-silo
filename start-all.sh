#!/bin/bash

GREEN='\033[0;32m'
orange='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'
ORANGE='\033[0;33m' 

echo -e "${ORANGE}starting silo...${NC}"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${ORANGE}cleaning up old logs and cache...${NC}"
bash "$SCRIPT_DIR/cleanup-startup.sh" 2>/dev/null || true

# Kill all existing processes using kill-all.sh
echo -e "${ORANGE}stopping any existing services...${NC}"
if [ -f "$SCRIPT_DIR/kill-all.sh" ]; then
  bash "$SCRIPT_DIR/kill-all.sh"
else
  echo -e "${RED}WARNING: kill-all.sh not found, using inline kill logic${NC}"
  pkill -9 -f "uvicorn" 2>/dev/null || true
  pkill -9 -f "next.*dev" 2>/dev/null || true
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

# Wait and verify ports are free
echo -e "${ORANGE}verifying ports are free...${NC}"
sleep 2
for i in {1..5}; do
  if lsof -ti:8000 >/dev/null 2>&1 || lsof -ti:3000 >/dev/null 2>&1; then
    echo -e "${ORANGE}waiting for ports to be released (attempt $i/5)...${NC}"
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
  else
    break
  fi
done

# Final check
if lsof -ti:8000 >/dev/null 2>&1; then
  echo -e "${RED}ERROR: Port 8000 still in use after cleanup${NC}"
  lsof -i:8000
  exit 1
fi
if lsof -ti:3000 >/dev/null 2>&1; then
  echo -e "${RED}ERROR: Port 3000 still in use after cleanup${NC}"
  lsof -i:3000
  exit 1
fi
echo -e "${GREEN}✓ Ports 8000 and 3000 are free${NC}"

echo -e "${ORANGE}final log cleanup...${NC}"
rm -f backend/*.log 2>/dev/null || true
rm -f *.log 2>/dev/null || true

# Clear Next.js cache to ensure environment variables are reloaded
echo -e "${ORANGE}clearing Next.js cache...${NC}"
rm -rf "$SCRIPT_DIR/.next" 2>/dev/null || true

echo -e "${ORANGE}cleanup complete. starting services...${NC}"

# === LOCAL MODE SETUP: Remove demo data and configuration ===
echo -e "${ORANGE}configuring for local mode...${NC}"

# Remove demo mode flag from .env.local if it exists
if [ -f "$SCRIPT_DIR/.env.local" ]; then
  sed -i.bak '/NEXT_PUBLIC_DEMO_MODE/d' "$SCRIPT_DIR/.env.local"
  rm -f "$SCRIPT_DIR/.env.local.bak"
fi

# Remove demo-specific files
echo -e "${ORANGE}removing demo data...${NC}"
rm -rf "$SCRIPT_DIR/public/demo-silo" 2>/dev/null || true
rm -f "$SCRIPT_DIR/public/demo-logs.json" 2>/dev/null || true
rm -f "$SCRIPT_DIR/public/demo-media.json" 2>/dev/null || true
rm -f "$SCRIPT_DIR/backend/silos-demo.json" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/backend/demo-silo" 2>/dev/null || true

# Reset silos.json to blank state (remove any demo silo config)
if [ -f "$SCRIPT_DIR/backend/silos.json" ]; then
  # Check if it contains demo silo or is empty
  if grep -q '"demo"' "$SCRIPT_DIR/backend/silos.json" 2>/dev/null || [ "$(cat "$SCRIPT_DIR/backend/silos.json" | tr -d '[:space:]')" = '{"silos":{}}' ]; then
    echo -e "${ORANGE}creating default silo in silos.json...${NC}"
    CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S")
    echo "{\"silos\": {\"default\": {\"paths\": [], \"created_at\": \"$CREATED_AT\"}}}" > "$SCRIPT_DIR/backend/silos.json"
    echo -e "${GREEN}✓ default silo created${NC}"
  fi
else
  echo -e "${ORANGE}creating silos.json with default silo...${NC}"
  mkdir -p "$SCRIPT_DIR/backend"
  CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S")
  echo "{\"silos\": {\"default\": {\"paths\": [], \"created_at\": \"$CREATED_AT\"}}}" > "$SCRIPT_DIR/backend/silos.json"
  echo -e "${GREEN}✓ silos.json created with default silo${NC}"
fi

# Ensure cache directory exists
mkdir -p "$SCRIPT_DIR/backend/cache/silos"
echo -e "${GREEN}✓ local mode configured${NC}"

echo -e "${ORANGE}starting backend...${NC}"
cd "$SCRIPT_DIR"

if command -v python3 &> /dev/null; then
  PYTHON_CMD=python3
elif command -v python &> /dev/null; then
  PYTHON_CMD=python
else
  echo -e "${RED} python not found. please install python 3.8+${NC}"
  exit 1
fi

echo -e "${ORANGE}using python: $PYTHON_CMD${NC}"

if [ ! -f "$SCRIPT_DIR/.env.local" ]; then
  echo -e "${ORANGE}creating .env.local from template...${NC}"
  if [ -f "$SCRIPT_DIR/.env.example" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env.local"
    echo -e "${GREEN}✓ .env.local created from .env.example${NC}"
  else
    echo -e "${RED}❌ .env.example not found${NC}"
    exit 1
  fi
fi

if [ ! -d ".venv" ]; then
  echo -e "${ORANGE}creating virtual environment...${NC}"
  $PYTHON_CMD -m venv .venv
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ failed to create virtual environment${NC}"
    echo -e "${ORANGE}try: $PYTHON_CMD -m pip install --user virtualenv${NC}"
    exit 1
  fi
  
  echo -e "${ORANGE}installing dependencies (first run, this may take 10-15 minutes)...${NC}"
  source .venv/bin/activate
  pip install -r backend/requirements.txt
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ failed to install dependencies${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ dependencies installed${NC}"
else
  source .venv/bin/activate
  pip install -q -r backend/requirements.txt
fi

# Install frontend dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo -e "${ORANGE}installing frontend dependencies...${NC}"
  npm install
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ failed to install frontend dependencies${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ frontend dependencies installed${NC}"
fi

# Start backend with auto-restart
# Redirect stdin from /dev/null to prevent terminal job control issues
# Use -u flag for unbuffered output so logs appear immediately
(
  cd backend
  while true; do
    $PYTHON_CMD -u -m uvicorn app.main:app --port 8000 >> ../backend.log 2>&1 < /dev/null
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend crashed, restarting in 2 seconds..." >> ../backend.log
    sleep 2
  done
) &
BACKEND_PID=$!
disown $BACKEND_PID 2>/dev/null || true
echo -e "${GREEN}backend started with auto-restart (PID: $BACKEND_PID)${NC}"

# Wait for backend to become healthy
echo -e "${ORANGE}waiting for backend to become healthy...${NC}"
sleep 5  # Give backend process more time to load dependencies (DeepFace, etc.)

# First wait for the port to be listening
echo -e "${ORANGE}waiting for backend to bind to port 8000...${NC}"
PORT_READY=false
for i in $(seq 1 30); do
  if lsof -i :8000 -sTCP:LISTEN >/dev/null 2>&1; then
    PORT_READY=true
    echo -e "${GREEN}✓ backend port is listening${NC}"
    break
  fi
  sleep 1
  echo -n "."
done
echo ""

if [ "$PORT_READY" = false ]; then
  echo -e "${RED}✗ ERROR: Backend never bound to port 8000${NC}"
  echo -e "${ORANGE}Check backend logs:${NC}"
  tail -20 backend.log
  exit 1
fi

# Now check if it's actually healthy
echo -e "${ORANGE}waiting for backend health check...${NC}"
BACKEND_READY=false
HEALTH_CHECK_TIMEOUT=30  # Reduced since port is already listening
for i in $(seq 1 $HEALTH_CHECK_TIMEOUT); do
  # Try health check with more verbose error handling
  HEALTH_RESPONSE=$(curl -s -w "%{http_code}" http://127.0.0.1:8000/health 2>&1 | tail -n1)
  if [ "$HEALTH_RESPONSE" = "200" ]; then
    BACKEND_READY=true
    echo -e "\n${GREEN}✓ backend is healthy!${NC}"
    break
  fi
  sleep 1
  if [ $((i % 5)) -eq 0 ]; then
    echo -n " ${i}s"
  else
    echo -n "."
  fi
done
echo ""

if [ "$BACKEND_READY" = false ]; then
  echo -e "${RED}✗ CRITICAL ERROR: Backend failed to become healthy within ${HEALTH_CHECK_TIMEOUT} seconds${NC}"
  echo -e "${RED}This usually means the backend crashed on startup.${NC}"
  echo -e "${ORANGE}Check backend logs for errors:${NC}"
  echo -e "${ORANGE}  tail -50 $SCRIPT_DIR/backend.log${NC}"
  echo ""
  echo -e "${ORANGE}Note: If the backend is still starting (loading ML models), you can:${NC}"
  echo -e "${ORANGE}  1. Wait a bit longer and check: curl http://localhost:8000/health${NC}"
  echo -e "${ORANGE}  2. Or restart with: ./start-all.sh${NC}"
  echo ""
  echo -e "${RED}Stopping all services...${NC}"
  bash "$SCRIPT_DIR/stop-all.sh"
  exit 1
fi

echo -e "${ORANGE}starting frontend...${NC}"
cd "$SCRIPT_DIR"

# Ensure .env.local is loaded by Next.js
if [ -f ".env.local" ]; then
  echo -e "${ORANGE}loading .env.local configuration...${NC}"
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Start frontend with stdin redirected to prevent terminal job control issues
(
  npm run dev > frontend.log 2>&1 < /dev/null
) &
FRONTEND_PID=$!
disown $FRONTEND_PID 2>/dev/null || true
echo -e "${GREEN}frontend started (PID: $FRONTEND_PID)${NC}"

sleep 2

echo ""
echo -e "${GREEN}✅ all services started successfully!${NC}"
echo ""
echo -e "${GREEN}🌐 Frontend:${NC} http://localhost:3000"
echo -e "${GREEN}🔧 Backend:${NC}  http://localhost:8000"
echo ""
echo "backend logs:        tail -f $SCRIPT_DIR/backend.log"
echo "frontend logs:       tail -f $SCRIPT_DIR/frontend.log"
echo ""
echo "To stop all services, run: ./stop-all.sh"
echo "Services are running as independent daemons and won't crash when you use this terminal."
echo ""

exit 0

wait
