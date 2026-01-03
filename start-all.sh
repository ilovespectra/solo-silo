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

echo -e "${RED}stopping any existing services...${NC}"

pkill -TERM -f "uvicorn" 2>/dev/null || true
pkill -TERM -f "face_detection_worker" 2>/dev/null || true
sleep 1

pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "face_detection_worker" 2>/dev/null || true
pkill -9 -f "app.main" 2>/dev/null || true

pkill -9 -f "next.*dev" 2>/dev/null || true
pkill -9 -f "npm run dev" 2>/dev/null || true
sleep 1

lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

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
  # Check if it contains demo silo
  if grep -q '"demo"' "$SCRIPT_DIR/backend/silos.json" 2>/dev/null; then
    echo -e "${ORANGE}removing demo silo from silos.json...${NC}"
    echo '{"silos": {}}' > "$SCRIPT_DIR/backend/silos.json"
    echo -e "${GREEN}✓ silos.json reset to blank state${NC}"
  fi
else
  echo -e "${ORANGE}creating blank silos.json...${NC}"
  echo '{"silos": {}}' > "$SCRIPT_DIR/backend/silos.json"
  echo -e "${GREEN}✓ blank silos.json created${NC}"
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

(
  source .venv/bin/activate 
  cd backend 
  $PYTHON_CMD -m uvicorn app.main:app --port 8000 --reload > ../backend.log 2>&1
) > /dev/null 2>&1 &
BACKEND_PID=$!
disown $BACKEND_PID 2>/dev/null || true
echo -e "${GREEN}backend started (PID: $BACKEND_PID)${NC}"
sleep 3
if ps -p $BACKEND_PID > /dev/null 2>&1; then
  echo -e "${GREEN}✓ backend process verified running${NC}"
else
  echo -e "${RED}❌ backend process check failed. check logs:${NC}"
  tail -20 backend.log 2>/dev/null || echo "No logs yet"
  exit 1
fi

sleep 3

echo -e "${ORANGE}starting frontend...${NC}"
cd "$SCRIPT_DIR"

# Ensure .env.local is loaded by Next.js
if [ -f ".env.local" ]; then
  echo -e "${ORANGE}loading .env.local configuration...${NC}"
  export $(cat .env.local | grep -v '^#' | xargs)
fi

(
  npm run dev > frontend.log 2>&1
) > /dev/null 2>&1 &
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
echo "backend logs:  tail -f $SCRIPT_DIR/backend.log"
echo "frontend logs: tail -f $SCRIPT_DIR/frontend.log"
echo ""
echo "To stop all services, run: ./stop-all.sh"
echo "Services are running as independent daemons and won't crash when you use this terminal."
echo ""

exit 0

wait
