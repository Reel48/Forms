#!/usr/bin/env python3
"""
Setup Admin User Script
Creates admin role for admin@reel48.com user in Supabase
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from database import supabase
import uuid
from datetime import datetime

def setup_admin_user(user_id: str = None):
    """
    Set up admin user role.
    If user_id is provided, uses that. Otherwise, tries to find user by email.
    """
    admin_email = "admin@reel48.com"
    
    if not user_id:
        print(f"Looking up user by email: {admin_email}")
        # Try to find user by email
        # Note: This requires service role key to query auth.users
        # For now, we'll require user_id
        print("Error: User ID is required. Please provide it as an argument.")
        print("Usage: python setup-admin-user.py <user_id>")
        return False
    
    print(f"Setting up admin role for user: {user_id}")
    
    try:
        # Check if role already exists
        existing = supabase.table("user_roles").select("*").eq("user_id", user_id).execute()
        
        if existing.data:
            # Update existing role to admin
            result = supabase.table("user_roles").update({
                "role": "admin",
                "updated_at": datetime.now().isoformat()
            }).eq("user_id", user_id).execute()
            
            if result.data:
                print(f"✅ Updated existing user role to admin")
                return True
            else:
                print("❌ Failed to update user role")
                return False
        else:
            # Create new admin role
            result = supabase.table("user_roles").insert({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "role": "admin",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }).execute()
            
            if result.data:
                print(f"✅ Created admin role for user {user_id}")
                return True
            else:
                print("❌ Failed to create user role")
                return False
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print("\nYou may need to run this SQL manually in Supabase SQL Editor:")
        print(f"""
INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '{user_id}',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE
SET role = 'admin', updated_at = NOW();
""")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
        success = setup_admin_user(user_id)
        sys.exit(0 if success else 1)
    else:
        print("Usage: python setup-admin-user.py <user_id>")
        print("\nTo get the user_id:")
        print("1. Go to Supabase Dashboard > Authentication > Users")
        print("2. Find admin@reel48.com")
        print("3. Copy the User ID (UUID)")
        print("4. Run: python setup-admin-user.py <user_id>")
        sys.exit(1)

