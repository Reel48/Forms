"""
Account lockout utilities
Handles tracking failed login attempts and locking accounts
"""
from database import supabase_storage
from datetime import datetime, timedelta
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Configuration
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15
LOCKOUT_DURATION_INCREMENT = 15  # Additional minutes per subsequent lockout


def record_login_attempt(
    email: str,
    user_id: Optional[str],
    ip_address: Optional[str],
    success: bool,
    failure_reason: Optional[str] = None
) -> None:
    """
    Record a login attempt (success or failure)
    """
    try:
        login_attempt = {
            "email": email.lower(),
            "user_id": user_id,
            "ip_address": ip_address,
            "success": success,
            "failure_reason": failure_reason,
            "attempted_at": datetime.now().isoformat()
        }
        supabase_storage.table("login_attempts").insert(login_attempt).execute()
    except Exception as e:
        logger.error(f"Failed to record login attempt: {str(e)}")
        # Don't fail the login if logging fails


def check_account_locked(email: str, user_id: Optional[str] = None) -> Tuple[bool, Optional[str]]:
    """
    Check if an account is locked.
    Returns: (is_locked, unlock_time_message)
    """
    try:
        # Try to find lockout by user_id first, then by email
        query = supabase_storage.table("account_lockouts").select("*")
        
        if user_id:
            query = query.eq("user_id", user_id)
        else:
            query = query.eq("email", email.lower())
        
        response = query.execute()
        
        if response.data and len(response.data) > 0:
            lockout = response.data[0]
            
            # Check if still locked
            if lockout.get("is_locked", False):
                unlock_at_str = lockout.get("unlock_at")
                if unlock_at_str:
                    try:
                        # Parse unlock time
                        if unlock_at_str.endswith('Z'):
                            unlock_at = datetime.fromisoformat(unlock_at_str.replace('Z', '+00:00'))
                        else:
                            unlock_at = datetime.fromisoformat(unlock_at_str)
                        
                        # Check if lockout has expired
                        now = datetime.now(unlock_at.tzinfo) if unlock_at.tzinfo else datetime.now()
                        if now >= unlock_at:
                            # Lockout expired, unlock the account
                            unlock_account(email, user_id)
                            return False, None
                        else:
                            # Still locked, calculate remaining time
                            remaining = unlock_at - now
                            minutes = int(remaining.total_seconds() / 60)
                            return True, f"Account is locked. Please try again in {minutes} minute(s)."
                    except Exception as e:
                        logger.error(f"Error parsing unlock time: {str(e)}")
                        # If we can't parse, assume still locked
                        return True, "Account is locked. Please try again later."
            
        return False, None
    except Exception as e:
        logger.error(f"Error checking account lockout: {str(e)}")
        # On error, don't block login (fail open)
        return False, None


def increment_failed_attempts(email: str, user_id: Optional[str] = None) -> None:
    """
    Increment failed login attempts and lock account if threshold reached
    """
    try:
        # Try to find existing lockout
        query = supabase_storage.table("account_lockouts").select("*")
        
        if user_id:
            query = query.eq("user_id", user_id)
        else:
            query = query.eq("email", email.lower())
        
        response = query.execute()
        
        if response.data and len(response.data) > 0:
            # Update existing lockout
            lockout = response.data[0]
            failed_attempts = lockout.get("failed_attempts", 0) + 1
            is_locked = failed_attempts >= MAX_FAILED_ATTEMPTS
            
            # Calculate lockout duration (increases with repeated lockouts)
            # Use number of times account has been locked (based on locked_at count)
            if is_locked:
                # Check how many times this account has been locked before
                # We'll use a simple approach: increase duration based on failed_attempts
                # For first lockout (5 attempts), use base duration
                # For subsequent lockouts, increase duration
                previous_lockouts = 0
                if lockout.get("locked_at"):
                    # If account was previously locked, this is a repeat lockout
                    previous_lockouts = 1
                
                lockout_duration = LOCKOUT_DURATION_MINUTES + (previous_lockouts * LOCKOUT_DURATION_INCREMENT)
                unlock_at = datetime.now() + timedelta(minutes=lockout_duration)
            else:
                unlock_at = lockout.get("unlock_at")
            
            # Update lockout record
            update_data = {
                "failed_attempts": failed_attempts,
                "is_locked": is_locked,
                "unlock_at": unlock_at.isoformat() if isinstance(unlock_at, datetime) else unlock_at,
                "updated_at": datetime.now().isoformat()
            }
            
            if is_locked:
                update_data["locked_at"] = datetime.now().isoformat()
            
            if user_id:
                supabase_storage.table("account_lockouts").update(update_data).eq("user_id", user_id).execute()
            else:
                supabase_storage.table("account_lockouts").update(update_data).eq("email", email.lower()).execute()
        else:
            # Create new lockout record
            failed_attempts = 1
            is_locked = failed_attempts >= MAX_FAILED_ATTEMPTS
            
            lockout_data = {
                "email": email.lower(),
                "user_id": user_id,
                "failed_attempts": failed_attempts,
                "is_locked": is_locked,
                "locked_at": datetime.now().isoformat() if is_locked else None,
                "unlock_at": (datetime.now() + timedelta(minutes=LOCKOUT_DURATION_MINUTES)).isoformat() if is_locked else None,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            supabase_storage.table("account_lockouts").insert(lockout_data).execute()
    except Exception as e:
        logger.error(f"Error incrementing failed attempts: {str(e)}")
        # Don't fail login if lockout tracking fails


def reset_failed_attempts(email: str, user_id: Optional[str] = None) -> None:
    """
    Reset failed login attempts on successful login
    """
    try:
        query = supabase_storage.table("account_lockouts").select("*")
        
        if user_id:
            query = query.eq("user_id", user_id)
        else:
            query = query.eq("email", email.lower())
        
        response = query.execute()
        
        if response.data and len(response.data) > 0:
            # Reset failed attempts
            update_data = {
                "failed_attempts": 0,
                "is_locked": False,
                "updated_at": datetime.now().isoformat()
            }
            
            if user_id:
                supabase_storage.table("account_lockouts").update(update_data).eq("user_id", user_id).execute()
            else:
                supabase_storage.table("account_lockouts").update(update_data).eq("email", email.lower()).execute()
    except Exception as e:
        logger.error(f"Error resetting failed attempts: {str(e)}")
        # Don't fail login if reset fails


def unlock_account(email: str, user_id: Optional[str] = None) -> None:
    """
    Manually unlock an account
    """
    try:
        query = supabase_storage.table("account_lockouts").select("*")
        
        if user_id:
            query = query.eq("user_id", user_id)
        else:
            query = query.eq("email", email.lower())
        
        response = query.execute()
        
        if response.data and len(response.data) > 0:
            update_data = {
                "is_locked": False,
                "failed_attempts": 0,
                "updated_at": datetime.now().isoformat()
            }
            
            if user_id:
                supabase_storage.table("account_lockouts").update(update_data).eq("user_id", user_id).execute()
            else:
                supabase_storage.table("account_lockouts").update(update_data).eq("email", email.lower()).execute()
    except Exception as e:
        logger.error(f"Error unlocking account: {str(e)}")

