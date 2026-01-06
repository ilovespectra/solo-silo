#!/bin/bash

# Colors for output
RED='\033[0;31m'
orange='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${orange}Stopping Silo services...${NC}"

# Kill parent shell loops FIRST (prevents auto-restart)
pkill -f "while true.*uvicorn" 2>/dev/null || true
sleep 0.5

# Kill by port SECOND (most direct)
if lsof -ti:8000 >/dev/null 2>&1; then
  echo -e "${orange}Stopping backend (port 8000)...${NC}"
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  sleep 0.5
  echo -e "${GREEN}Backend stopped${NC}"
fi

if lsof -ti:3000 >/dev/null 2>&1; then
  echo -e "${orange}Stopping frontend (port 3000)...${NC}"
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 0.5
  echo -e "${GREEN}Frontend stopped${NC}"
fi

# Also kill process patterns in case they're not bound yet
pkill -9 -f "python.*uvicorn.*8000" 2>/dev/null || true
pkill -9 -f "next.*dev" 2>/dev/null || true

# Final check and cleanup any remaining processes
for i in {1..3}; do
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 0.3
done

echo -e "${GREEN}✅ All services stopped!${NC}"
