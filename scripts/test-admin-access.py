#!/usr/bin/env python3
"""
Test Admin Access Script
Tests if admin@reel48.com can authenticate and get admin role
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from database import supabase, supabase_storage

def test_admin_access():
    """Test admin access for admin@reel48.com"""
    print("🔍 Testing Admin Access for admin@reel48.com")
    print("=" * 60)
    
    # 1. Check user exists
    print("\n1. Checking if user exists in auth.users...")
    try:
        # List all users and find by email
        users = supabase_storage.auth.admin.list_users()
        admin_user = None
        for user in users.users:
            if user.email == "admin@reel48.com":
                admin_user = user
                break
        
        if not admin_user:
            print("❌ User admin@reel48.com not found in auth.users")
            print("   Please create the user first in Supabase Dashboard")
            return False
        
        print(f"✅ User found:")
        print(f"   ID: {admin_user.id}")
        print(f"   Email: {admin_user.email}")
        print(f"   Created: {admin_user.created_at}")
        
    except Exception as e:
        print(f"❌ Error checking user: {str(e)}")
        return False
    
    # 2. Check role in user_roles table
    print("\n2. Checking role in user_roles table...")
    try:
        role_response = supabase.table("user_roles").select("*").eq("user_id", admin_user.id).execute()
        
        if role_response.data:
            role_data = role_response.data[0]
            role = role_data.get("role", "customer")
            print(f"✅ Role found: {role}")
            print(f"   Role ID: {role_data.get('id')}")
            print(f"   Created: {role_data.get('created_at')}")
            print(f"   Updated: {role_data.get('updated_at')}")
            
            if role != "admin":
                print(f"\n⚠️  WARNING: Role is '{role}', not 'admin'!")
                print("   Fixing role...")
                # Update role
                update_result = supabase.table("user_roles").update({
                    "role": "admin"
                }).eq("user_id", admin_user.id).execute()
                
                if update_result.data:
                    print("✅ Role updated to 'admin'")
                else:
                    print("❌ Failed to update role")
                    return False
        else:
            print("⚠️  No role found in user_roles table")
            print("   Creating admin role...")
            # Create role
            from datetime import datetime
            import uuid
            insert_result = supabase.table("user_roles").insert({
                "id": str(uuid.uuid4()),
                "user_id": admin_user.id,
                "role": "admin",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }).execute()
            
            if insert_result.data:
                print("✅ Admin role created")
            else:
                print("❌ Failed to create role")
                return False
                
    except Exception as e:
        print(f"❌ Error checking role: {str(e)}")
        return False
    
    # 3. Verify final state
    print("\n3. Verifying final state...")
    try:
        role_response = supabase.table("user_roles").select("*").eq("user_id", admin_user.id).execute()
        if role_response.data and role_response.data[0].get("role") == "admin":
            print("✅ Admin role verified!")
            print("\n" + "=" * 60)
            print("✅ admin@reel48.com is configured as admin")
            print("\nNext steps:")
            print("1. Make sure you're logged in as admin@reel48.com")
            print("2. Check browser console for any errors")
            print("3. Try refreshing the page or logging out and back in")
            print("4. Check the /api/auth/me endpoint to see your role")
            return True
        else:
            print("❌ Role verification failed")
            return False
    except Exception as e:
        print(f"❌ Error verifying: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_admin_access()
    sys.exit(0 if success else 1)

