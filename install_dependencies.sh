#!/bin/bash

echo "installing silo dependencies..."
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

if command -v python3 &> /dev/null; then
  PYTHON_CMD=python3
elif command -v python &> /dev/null; then
  PYTHON_CMD=python
else
  echo "❌ python not found. please install python 3.8+"
  exit 1
fi

echo "using python: $PYTHON_CMD"
$PYTHON_CMD --version
echo ""

if [ ! -d ".venv" ]; then
  echo "creating virtual environment..."
  $PYTHON_CMD -m venv .venv
  if [ $? -ne 0 ]; then
    echo "❌ failed to create virtual environment"
    echo "try: $PYTHON_CMD -m pip install --user virtualenv"
    exit 1
  fi
fi

echo "activating virtual environment..."
source .venv/bin/activate

echo "installing python packages (this will take 10-15 minutes)..."
pip install -r backend/requirements.txt

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ installation complete!"
    echo ""
    echo "next steps:"
    echo "1. run: ./start-all.sh"
    echo ""
    echo "or manually:"
    echo "  backend: source .venv/bin/activate && cd backend && $PYTHON_CMD -m uvicorn app.main:app --reload --port 8000"
    echo "  frontend (new terminal): npm run dev"
    echo ""
    echo "3. open http://localhost:3000"
    echo ""
else
    echo ""
    echo "❌ installation failed. check errors above."
    exit 1
fi
