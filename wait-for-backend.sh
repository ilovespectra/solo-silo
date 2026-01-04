#!/bin/bash
# Wait for backend to be healthy before proceeding

MAX_WAIT=60  # Maximum 60 seconds
INTERVAL=2   # Check every 2 seconds
elapsed=0

echo "⏳ Waiting for backend to become healthy..."

while [ $elapsed -lt $MAX_WAIT ]; do
    if curl -s -f http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend is healthy!"
        exit 0
    fi
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
    echo "   Still waiting... (${elapsed}s/${MAX_WAIT}s)"
done

echo "❌ Backend did not become healthy within ${MAX_WAIT} seconds"
exit 1
