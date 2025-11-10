#!/bin/bash

# Setup Frontend Environment Variables
# This script helps you set up the frontend .env file

set -e

FRONTEND_DIR="$(cd "$(dirname "$0")/../frontend" && pwd)"
ENV_FILE="${FRONTEND_DIR}/.env"

echo "=========================================="
echo "Frontend Environment Setup"
echo "=========================================="
echo ""

# Get Supabase URL and Key from credentials
SUPABASE_URL="https://boisewltuwcjfrdjnfwd.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaXNld2x0dXdjamZyZGpuZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTU1OTEsImV4cCI6MjA3ODAzMTU5MX0.2n5T_YlWgrN50ADQdnO-o9dWVYVPKt4NQ8qtjGs_oi4"

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
  echo "⚠️  .env file already exists at: $ENV_FILE"
  read -p "Do you want to overwrite it? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping .env file creation."
    exit 0
  fi
fi

# Create .env file
cat > "$ENV_FILE" <<EOF
# Supabase Configuration
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# API Configuration
VITE_API_URL=http://localhost:8000
EOF

echo "✅ Created .env file at: $ENV_FILE"
echo ""
echo "Contents:"
echo "--------------------------------------------"
cat "$ENV_FILE"
echo "--------------------------------------------"
echo ""
echo "✅ Frontend environment setup complete!"
echo ""
echo "Note: For production, update VITE_API_URL to your backend URL"

