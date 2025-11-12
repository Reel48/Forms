"""
Password history utilities
Prevents password reuse
"""
from database import supabase_storage
from typing import List
import hashlib
import logging

logger = logging.getLogger(__name__)

# Number of previous passwords to check
PASSWORD_HISTORY_LIMIT = 5


def hash_password_for_history(password: str) -> str:
    """
    Hash a password for history comparison.
    We use SHA256 for comparison purposes only (not for authentication).
    Supabase handles the actual secure password hashing.
    """
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def check_password_history(user_id: str, new_password: str) -> bool:
    """
    Check if the new password matches any of the recent password hashes.
    
    Args:
        user_id: The user ID
        new_password: The new password (plaintext, will be hashed for comparison)
    
    Returns:
        True if password is in history (should be rejected), False otherwise
    """
    try:
        new_password_hash = hash_password_for_history(new_password)
        
        # Get recent password hashes for this user
        response = supabase_storage.table("password_history").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(PASSWORD_HISTORY_LIMIT).execute()
        
        if response.data:
            for history_entry in response.data:
                stored_hash = history_entry.get("password_hash")
                if stored_hash == new_password_hash:
                    return True  # Password is in history
        
        return False  # Password is not in history
    except Exception as e:
        logger.error(f"Error checking password history: {str(e)}")
        # On error, don't block password change (fail open)
        return False


def add_password_to_history(user_id: str, password: str) -> None:
    """
    Add a password to the user's password history.
    
    Args:
        user_id: The user ID
        password: The password (plaintext, will be hashed for storage)
    """
    try:
        password_hash = hash_password_for_history(password)
        
        # Add to history
        supabase_storage.table("password_history").insert({
            "user_id": user_id,
            "password_hash": password_hash
        }).execute()
        
        # Clean up old history (keep only last 5)
        cleanup_old_password_history(user_id)
    except Exception as e:
        logger.error(f"Error adding password to history: {str(e)}")
        # Don't fail password change if history update fails


def cleanup_old_password_history(user_id: str) -> None:
    """
    Clean up old password history entries, keeping only the most recent N.
    
    Args:
        user_id: The user ID
    """
    try:
        # Get all history entries for user, ordered by date
        response = supabase_storage.table("password_history").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        
        if response.data and len(response.data) > PASSWORD_HISTORY_LIMIT:
            # Delete entries beyond the limit
            entries_to_delete = response.data[PASSWORD_HISTORY_LIMIT:]
            for entry in entries_to_delete:
                supabase_storage.table("password_history").delete().eq("id", entry["id"]).execute()
    except Exception as e:
        logger.error(f"Error cleaning up password history: {str(e)}")

