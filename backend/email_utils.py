"""
Utility functions for email notifications
"""
from typing import List, Dict
from database import supabase_storage, supabase_url, supabase_service_role_key
import requests


def get_admin_emails() -> List[Dict[str, str]]:
    """
    Get all admin user email addresses and names
    
    Returns:
        List of dicts with 'email' and 'name' keys for each admin
    """
    admin_emails = []
    
    if not supabase_service_role_key:
        return admin_emails
    
    try:
        # Get all admin users from user_roles table
        roles_response = supabase_storage.table("user_roles").select("user_id").eq("role", "admin").execute()
        
        if not roles_response.data:
            return admin_emails
        
        admin_user_ids = [role.get("user_id") for role in roles_response.data if role.get("user_id")]
        
        if not admin_user_ids:
            return admin_emails
        
        # Fetch admin user details from Supabase Auth using REST API
        auth_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": supabase_service_role_key,
            "Authorization": f"Bearer {supabase_service_role_key}",
            "Content-Type": "application/json"
        }
        
        try:
            # Get all users (with pagination if needed)
            response = requests.get(auth_url, headers=headers, params={"per_page": 1000}, timeout=10)
            if response.status_code == 200:
                users_data = response.json()
                for auth_user in users_data.get("users", []):
                    user_id = auth_user.get("id")
                    if user_id in admin_user_ids:
                        user_email = auth_user.get("email")
                        user_metadata = auth_user.get("user_metadata", {})
                        user_name = user_metadata.get("name")
                        
                        if user_email:
                            admin_emails.append({
                                "email": user_email,
                                "name": user_name
                            })
        except Exception as e:
            print(f"Warning: Could not fetch admin users from auth API: {e}")
            
    except Exception as e:
        print(f"Error getting admin emails: {str(e)}")
    
    return admin_emails

