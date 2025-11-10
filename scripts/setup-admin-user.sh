#!/bin/bash

# Setup Admin User Script
# This script helps you create the admin user (admin@reel48.com) in Supabase

set -e

echo "=========================================="
echo "Admin User Setup Script"
echo "=========================================="
echo ""
echo "This script will help you create the admin user."
echo "You'll need to create the user in Supabase Dashboard first,"
echo "then this script will add the admin role."
echo ""
echo "Step 1: Create the user in Supabase Dashboard"
echo "--------------------------------------------"
echo "1. Go to: https://supabase.com/dashboard/project/boisewltuwcjfrdjnfwd/auth/users"
echo "2. Click 'Add User' > 'Create New User'"
echo "3. Enter:"
echo "   - Email: admin@reel48.com"
echo "   - Password: (choose a strong password)"
echo "   - Auto Confirm User: ✅ (checked)"
echo "4. Click 'Create User'"
echo "5. Copy the User ID (UUID) from the user list"
echo ""
read -p "Press Enter when you've created the user and have the User ID ready..."

echo ""
echo "Step 2: Enter the User ID"
echo "--------------------------------------------"
read -p "Paste the User ID (UUID) here: " USER_ID

if [ -z "$USER_ID" ]; then
  echo "Error: User ID cannot be empty"
  exit 1
fi

echo ""
echo "Step 3: Add Admin Role"
echo "--------------------------------------------"
echo "Now we'll add the admin role to the user_roles table."
echo ""

# Check if we have Supabase credentials
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Note: SUPABASE_SERVICE_ROLE_KEY not set in environment."
  echo "You'll need to run this SQL manually in Supabase SQL Editor:"
  echo ""
  echo "SQL to run:"
  echo "--------------------------------------------"
  cat <<EOF
INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '${USER_ID}',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE
SET role = 'admin', updated_at = NOW();
EOF
  echo ""
  echo "Or use the Python script: python scripts/setup-admin-user.py"
else
  echo "Using Supabase API to add admin role..."
  # We could use curl here, but Python script is easier
  python3 scripts/setup-admin-user.py "$USER_ID"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "You can now log in with:"
echo "  Email: admin@reel48.com"
echo "  Password: (the password you set)"
echo ""

