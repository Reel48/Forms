"""
Token utilities for revocation and session management
"""
import hashlib
from typing import Optional
from database import supabase_storage
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


def hash_token(token: str) -> str:
    """
    Create a SHA256 hash of a token for storage.
    We hash tokens instead of storing them directly for security.
    """
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def revoke_token(token: str, user_id: str, reason: str = "logout") -> bool:
    """
    Revoke a token by adding it to the blacklist.
    
    Args:
        token: The JWT token to revoke
        user_id: The user ID who owns the token
        reason: Reason for revocation (e.g., "logout", "security_breach")
    
    Returns:
        True if token was revoked successfully
    """
    try:
        from jose import jwt
        
        # Decode token to get expiration (without verification since we're revoking it)
        try:
            # Try to decode without verification to get expiration
            payload = jwt.decode(token, options={"verify_signature": False})
            exp = payload.get("exp")
            if exp:
                expires_at = datetime.fromtimestamp(exp)
            else:
                # Default to 1 hour from now if no expiration
                expires_at = datetime.now().replace(microsecond=0) + timedelta(hours=1)
        except:
            # If we can't decode, assume 1 hour expiration
            expires_at = datetime.now().replace(microsecond=0) + timedelta(hours=1)
        
        token_hash = hash_token(token)
        
        # Check if token is already revoked
        existing = supabase_storage.table("revoked_tokens").select("*").eq("token_hash", token_hash).execute()
        if existing.data and len(existing.data) > 0:
            # Already revoked
            return True
        
        # Add to blacklist
        supabase_storage.table("revoked_tokens").insert({
            "token_hash": token_hash,
            "user_id": user_id,
            "expires_at": expires_at.isoformat(),
            "reason": reason,
            "revoked_at": datetime.now().isoformat()
        }).execute()
        
        return True
    except Exception as e:
        logger.error(f"Failed to revoke token: {str(e)}")
        return False


def revoke_token_hash(token_hash: str, user_id: str, expires_at: datetime, reason: str = "logout") -> bool:
    """
    Revoke a token when we only have its hash (e.g., for session revocation).
    """
    try:
        # Check if token hash is already revoked
        existing = (
            supabase_storage.table("revoked_tokens")
            .select("*")
            .eq("token_hash", token_hash)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            return True

        supabase_storage.table("revoked_tokens").insert({
            "token_hash": token_hash,
            "user_id": user_id,
            "expires_at": expires_at.isoformat(),
            "reason": reason,
            "revoked_at": datetime.now().isoformat()
        }).execute()

        return True
    except Exception as e:
        logger.error(f"Failed to revoke token hash: {str(e)}")
        return False


def is_token_revoked(token: str, *, fail_closed: bool = False) -> bool:
    """
    Check if a token has been revoked.
    
    Args:
        token: The JWT token to check
        fail_closed: If True, treat errors as revoked (more secure).
    
    Returns:
        True if token is revoked, False otherwise
    """
    try:
        token_hash = hash_token(token)
        
        # Check if token is in blacklist
        response = supabase_storage.table("revoked_tokens").select("*").eq("token_hash", token_hash).execute()
        
        if response.data and len(response.data) > 0:
            # Token is revoked
            return True
        
        return False
    except Exception as e:
        logger.error(f"Failed to check token revocation: {str(e)}")
        # On error, either fail open or fail closed depending on caller
        return True if fail_closed else False


def revoke_all_user_tokens(user_id: str, reason: str = "logout_all") -> int:
    """
    Revoke all active tokens for a user.
    This is used for "Log out all devices" functionality.
    
    Args:
        user_id: The user ID
        reason: Reason for revocation
    
    Returns:
        Number of tokens revoked
    """
    try:
        # Get all active sessions for user
        sessions = supabase_storage.table("user_sessions").select("*").eq("user_id", user_id).eq("is_active", True).execute()
        
        revoked_count = 0
        if sessions.data:
            for session in sessions.data:
                token_hash = session.get("token_hash")
                expires_at_raw = session.get("expires_at")
                if token_hash and expires_at_raw:
                    # Parse expires_at safely
                    try:
                        expires_at = (
                            datetime.fromisoformat(expires_at_raw.replace("Z", "+00:00"))
                            if isinstance(expires_at_raw, str)
                            else expires_at_raw
                        )
                        if not isinstance(expires_at, datetime):
                            expires_at = datetime.now().replace(microsecond=0) + timedelta(hours=1)
                    except Exception:
                        expires_at = datetime.now().replace(microsecond=0) + timedelta(hours=1)

                    # Blacklist token hash and mark session inactive
                    revoke_token_hash(token_hash, user_id, expires_at, reason=reason)
                    supabase_storage.table("user_sessions").update({"is_active": False}).eq("id", session["id"]).execute()
                    revoked_count += 1
        
        return revoked_count
    except Exception as e:
        logger.error(f"Failed to revoke all user tokens: {str(e)}")
        return 0

