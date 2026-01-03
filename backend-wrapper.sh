#!/bin/bash

# Backend auto-restart wrapper
# Keeps the backend running even if it crashes

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
ORANGE='\033[0;33m'
NC='\033[0m'

# Activate virtual environment
source .venv/bin/activate

# Determine Python command
if command -v python3 &> /dev/null; then
  PYTHON_CMD=python3
elif command -v python &> /dev/null; then
  PYTHON_CMD=python
else
  echo -e "${RED}python not found${NC}"
  exit 1
fi

RESTART_COUNT=0
MAX_RAPID_RESTARTS=5
RAPID_RESTART_WINDOW=60  # seconds

while true; do
  START_TIME=$(date +%s)
  
  echo -e "${ORANGE}[$(date '+%H:%M:%S')] Starting backend (restart #$RESTART_COUNT)...${NC}" >> backend-wrapper.log
  
  cd backend
  $PYTHON_CMD -m uvicorn app.main:app --port 8000 --reload >> ../backend.log 2>&1
  EXIT_CODE=$?
  cd ..
  
  END_TIME=$(date +%s)
  UPTIME=$((END_TIME - START_TIME))
  
  echo -e "${RED}[$(date '+%H:%M:%S')] Backend exited with code $EXIT_CODE after ${UPTIME}s${NC}" >> backend-wrapper.log
  
  # If it ran for less than the rapid restart window, increment counter
  if [ $UPTIME -lt $RAPID_RESTART_WINDOW ]; then
    RESTART_COUNT=$((RESTART_COUNT + 1))
    
    # If too many rapid restarts, give up
    if [ $RESTART_COUNT -ge $MAX_RAPID_RESTARTS ]; then
      echo -e "${RED}[$(date '+%H:%M:%S')] Too many rapid restarts ($RESTART_COUNT in quick succession). Stopping.${NC}" >> backend-wrapper.log
      echo -e "${RED}Backend crashed repeatedly. Check backend.log for errors.${NC}"
      exit 1
    fi
    
    echo -e "${ORANGE}Waiting 5 seconds before restart...${NC}" >> backend-wrapper.log
    sleep 5
  else
    # Reset restart counter if it ran for a while
    RESTART_COUNT=0
    echo -e "${GREEN}Restarting immediately (backend was stable)...${NC}" >> backend-wrapper.log
    sleep 2
  fi
done
