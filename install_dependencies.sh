#!/bin/bash

# AuraFind - Dependency Installation Script
# This installs all required Python packages for the AI photo search system

echo "🚀 Installing AuraFind Dependencies..."
echo ""

cd /Users/tanny/Documents/github/dudlefotos/backend

echo "📦 Installing Python packages (this will take 10-15 minutes)..."
pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "Next steps:"
    echo "1. Start the backend:"
    echo "   python -m uvicorn app.main:app --reload --port 8000"
    echo ""
    echo "2. In another terminal, start the frontend:"
    echo "   npm run dev"
    echo ""
    echo "3. Open http://localhost:3000"
    echo ""
else
    echo ""
    echo "❌ Installation failed. Check errors above."
    exit 1
fi
