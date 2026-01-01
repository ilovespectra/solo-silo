#!/bin/bash
# Find and replace relative /api/ calls with apiUrl helper

find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e "s|fetch('/api/|fetch(apiUrl('/api/|g" \
  -e "s|fetch(\"/api/|fetch(apiUrl(\"/api/|g" \
  {} +

echo "Done! Don't forget to add: import { apiUrl } from '@/lib/api'; to files that need it"
