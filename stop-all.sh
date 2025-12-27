#!/bin/bash

# Colors for output
RED='\033[0;31m'
orange='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${orange}Stopping Dudlefotos services...${NC}"

# Kill all Python processes (backend)
if pgrep -f "python.*uvicorn.*8000" > /dev/null; then
  echo -e "${orange}Stopping backend...${NC}"
  pkill -f "python.*uvicorn.*8000"
  echo -e "${GREEN}Backend stopped${NC}"
fi

# Kill all Node processes (frontend) - be careful here
if pgrep -f "next.*dev" > /dev/null; then
  echo -e "${orange}Stopping frontend...${NC}"
  pkill -f "next.*dev"
  echo -e "${GREEN}Frontend stopped${NC}"
fi

echo -e "${GREEN}✅ All services stopped!${NC}"
