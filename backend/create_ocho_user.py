#!/usr/bin/env python3
"""
Script to create the AI assistant user account "Ocho" in Supabase Auth
Run this script once to set up the AI user account.

Usage:
    python3 create_ocho_user.py
"""

import os
import sys
import uuid
import requests
import json
from datetime import datetime
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import supabase_storage, supabase_service_role_key, supabase_url

load_dotenv()

AI_EMAIL = "ocho@reel48.ai"
AI_NAME = "Ocho"
AI_PASSWORD = os.getenv("OCHO_PASSWORD") or str(uuid.uuid4())  # Use env var or generate random

def create_ocho_user():
    """Create the AI assistant user account"""
    print(f"Creating AI assistant user account: {AI_NAME} ({AI_EMAIL})")
    
    if not supabase_service_role_key:
        print("❌ SUPABASE_SERVICE_ROLE_KEY not set. Cannot create user.")
        return None
    
    try:
        user_id = None
        
        # First, try to find existing user by checking clients table
        try:
            client_check = supabase_storage.table("clients").select("user_id").eq("email", AI_EMAIL).execute()
            if client_check.data and len(client_check.data) > 0:
                user_id = client_check.data[0].get("user_id")
                if user_id:
                    print(f"✅ Found existing AI user: {user_id}")
        except Exception as e:
            print(f"⚠️  Could not check existing user: {str(e)}")
        
        # If user doesn't exist, create it using REST API
        if not user_id:
            try:
                print("Creating new user via Supabase Auth REST API...")
                
                auth_url = f"{supabase_url}/auth/v1/admin/users"
                headers = {
                    "apikey": supabase_service_role_key,
                    "Authorization": f"Bearer {supabase_service_role_key}",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "email": AI_EMAIL,
                    "password": AI_PASSWORD,
                    "email_confirm": True,
                    "user_metadata": {
                        "name": AI_NAME,
                        "is_ai": True
                    }
                }
                
                response = requests.post(auth_url, headers=headers, json=payload, timeout=10)
                
                if response.status_code in [200, 201]:
                    user_data = response.json()
                    # Handle different response formats
                    if isinstance(user_data, dict):
                        user_id = user_data.get("id") or user_data.get("user", {}).get("id")
                    else:
                        user_id = user_data.id if hasattr(user_data, 'id') else None
                    
                    if user_id:
                        print(f"✅ User created via REST API: {user_id}")
                    else:
                        print(f"⚠️  User created but couldn't extract ID. Response: {user_data}")
                        # Try to get from response text
                        try:
                            data = json.loads(response.text) if isinstance(response.text, str) else response.json()
                            user_id = data.get("id") or data.get("user", {}).get("id")
                            if user_id:
                                print(f"✅ Extracted user ID: {user_id}")
                        except:
                            pass
                elif response.status_code == 422:
                    # User might already exist, try to find it
                    print("⚠️  User might already exist (422). Checking...")
                    list_response = requests.get(
                        f"{auth_url}?per_page=1000",
                        headers=headers,
                        timeout=10
                    )
                    if list_response.status_code == 200:
                        users = list_response.json().get("users", [])
                        existing = next((u for u in users if u.get("email") == AI_EMAIL), None)
                        if existing:
                            user_id = existing.get("id")
                            print(f"✅ Found existing user: {user_id}")
                        else:
                            print(f"❌ User not found in list. Response: {list_response.text[:200]}")
                    else:
                        print(f"❌ Failed to list users: {list_response.status_code}")
                        print(f"Response: {list_response.text[:200]}")
                else:
                    print(f"❌ Failed to create user: {response.status_code}")
                    print(f"Response: {response.text[:500]}")
                    return None
                    
            except Exception as e:
                print(f"❌ Error creating user: {str(e)}")
                import traceback
                traceback.print_exc()
                return None
        
        if not user_id:
            print("❌ Could not get or create user ID")
            return None
        
        # Create user role entry
        try:
            # Check if role already exists
            role_check = supabase_storage.table("user_roles").select("*").eq("user_id", user_id).execute()
            
            if role_check.data and len(role_check.data) > 0:
                # Update existing role
                supabase_storage.table("user_roles").update({
                    "role": "ai",
                    "updated_at": datetime.now().isoformat()
                }).eq("user_id", user_id).execute()
                print(f"✅ User role updated to 'ai'")
            else:
                # Create new role
                supabase_storage.table("user_roles").insert({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "role": "ai",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }).execute()
                print(f"✅ User role created: 'ai'")
        except Exception as e:
            print(f"⚠️  Warning: Failed to create/update user role: {str(e)}")
        
        # Create client record
        try:
            client_check = supabase_storage.table("clients").select("*").eq("user_id", user_id).execute()
            
            if client_check.data and len(client_check.data) > 0:
                # Update existing client
                supabase_storage.table("clients").update({
                    "name": AI_NAME,
                    "email": AI_EMAIL,
                    "updated_at": datetime.now().isoformat()
                }).eq("user_id", user_id).execute()
                print(f"✅ Client record updated")
            else:
                # Create new client
                supabase_storage.table("clients").insert({
                    "name": AI_NAME,
                    "email": AI_EMAIL,
                    "user_id": user_id,
                    "registration_source": "system"
                }).execute()
                print(f"✅ Client record created")
        except Exception as e:
            print(f"⚠️  Warning: Failed to create/update client record: {str(e)}")
        
        print(f"\n✅ Success! AI user account created:")
        print(f"   User ID: {user_id}")
        print(f"   Email: {AI_EMAIL}")
        print(f"   Name: {AI_NAME}")
        print(f"   Role: ai")
        print(f"\n📝 Add this to your .env file:")
        print(f"   OCHO_USER_ID={user_id}")
        print(f"\n💾 Save this user ID - you'll need it for the code update!")
        
        return user_id
        
    except Exception as e:
        print(f"❌ Error creating AI user: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    create_ocho_user()
