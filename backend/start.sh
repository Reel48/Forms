#!/bin/bash
# Railway startup script
# This script handles both cases:
# 1. Root Directory NOT set: Railway copies repo root to /app, so backend is at /app/backend
# 2. Root Directory SET to "backend": Railway copies backend to /app directly

set -e

echo "=== Railway Startup Script ==="
echo "PORT: ${PORT:-8000}"
echo "PWD: $(pwd)"

# Determine the correct directory
if [ -f "/app/backend/main.py" ]; then
    echo "Found /app/backend/main.py - using /app/backend"
    cd /app/backend
elif [ -f "/app/main.py" ]; then
    echo "Found /app/main.py - using /app"
    cd /app
elif [ -f "main.py" ]; then
    echo "Found main.py in current directory"
else
    echo "ERROR: Cannot find main.py!"
    echo "Listing /app contents:"
    ls -la /app/ 2>&1 || true
    echo "Listing current directory:"
    ls -la . 2>&1 || true
    exit 1
fi

echo "Final working directory: $(pwd)"
echo "Verifying main.py exists:"
ls -la main.py

echo "Starting uvicorn..."
exec /app/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

