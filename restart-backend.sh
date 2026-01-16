#!/bin/bash
cd /Users/tanny/Documents/github/solo-silo
pkill -f "uvicorn app.main:app"
sleep 2
cd backend
python -m uvicorn app.main:app --port 8000 > ../backend.log 2>&1 &
