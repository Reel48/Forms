#!/usr/bin/env python3
"""
Check and Fix Admin User Script
Checks if admin@reel48.com has admin role and fixes it if needed
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from database import supabase_storage, supabase
import uuid
from datetime import datetime

def find_user_by_email(email: str):
    """Find user by email using Supabase Auth Admin API"""
    try:
        # List all users and find by email
        # Note: This is a workaround since there's no direct email lookup in admin API
        users_response = supabase_storage.auth.admin.list_users()
        
        if users_response and users_response.users:
            for user in users_response.users:
                if user.email == email:
                    return user
        return None
    except Exception as e:
        print(f"Error finding user: {str(e)}")
        return None

def check_and_fix_admin(email: str = "admin@reel48.com"):
    """Check if user has admin role and fix if needed"""
    print(f"🔍 Checking admin access for: {email}")
    print("-" * 50)
    
    # Find user by email
    print(f"1. Looking up user by email...")
    user = find_user_by_email(email)
    
    if not user:
        print(f"❌ User {email} not found in Supabase Auth")
        print("\nPlease ensure the user exists:")
        print("1. Go to Supabase Dashboard > Authentication > Users")
        print("2. Check if admin@reel48.com exists")
        print("3. If not, create the user first")
        return False
    
    user_id = user.id
    print(f"✅ Found user: {user_id}")
    print(f"   Email: {user.email}")
    
    # Check current role
    print(f"\n2. Checking current role...")
    try:
        role_response = supabase.table("user_roles").select("*").eq("user_id", user_id).execute()
        
        if role_response.data:
            current_role = role_response.data[0].get("role", "customer")
            print(f"   Current role: {current_role}")
            
            if current_role == "admin":
                print(f"✅ User already has admin role!")
                return True
            else:
                print(f"⚠️  User has role '{current_role}', updating to 'admin'...")
        else:
            print(f"⚠️  No role found, creating admin role...")
    except Exception as e:
        print(f"⚠️  Error checking role: {str(e)}")
        print(f"   Will attempt to create admin role...")
    
    # Fix the role
    print(f"\n3. Setting up admin role...")
    try:
        # Try to update first (in case role exists)
        update_result = supabase.table("user_roles").update({
            "role": "admin",
            "updated_at": datetime.now().isoformat()
        }).eq("user_id", user_id).execute()
        
        if update_result.data:
            print(f"✅ Updated role to admin")
            return True
        
        # If update didn't work, try insert
        insert_result = supabase.table("user_roles").insert({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "role": "admin",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }).execute()
        
        if insert_result.data:
            print(f"✅ Created admin role")
            return True
        else:
            print(f"❌ Failed to create/update role")
            return False
            
    except Exception as e:
        print(f"❌ Error setting up admin role: {str(e)}")
        print(f"\n💡 You may need to run this SQL manually in Supabase SQL Editor:")
        print(f"""
-- Find user ID first
SELECT id, email FROM auth.users WHERE email = '{email}';

-- Then run this (replace USER_ID with the actual ID):
INSERT INTO user_roles (id, user_id, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'USER_ID',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE
SET role = 'admin', updated_at = NOW();
""")
        return False

if __name__ == "__main__":
    success = check_and_fix_admin()
    sys.exit(0 if success else 1)

