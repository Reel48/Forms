#!/bin/bash
set -e
echo "=== Starting Application ==="
echo "Current directory: $(pwd)"
echo "PORT: ${PORT:-8000}"

# Try to find the backend directory or use current directory
if [ -d "/app/backend" ]; then
    echo "Found /app/backend, changing to it..."
    cd /app/backend
elif [ -f "/app/main.py" ]; then
    echo "Found main.py in /app, using current directory..."
    cd /app
elif [ -f "main.py" ]; then
    echo "Found main.py in current directory, staying here..."
else
    echo "ERROR: Cannot find main.py!"
    ls -la /app/
    exit 1
fi

echo "Working directory: $(pwd)"
echo "Checking for main.py:"
ls -la main.py || (echo "main.py not found!" && exit 1)

echo "Python executable: /app/.venv/bin/python"
echo "Starting uvicorn server..."
exec /app/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

