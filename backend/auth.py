"""
Authentication utilities for FastAPI
Handles JWT token verification and user role checking
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import supabase, supabase_storage
from typing import Optional
import os
from jose import JWTError, jwt
import json

security = HTTPBearer()

# Get JWT secret from environment (Supabase JWT secret)
# This is used to verify tokens
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")

if not JWT_SECRET:
    print("WARNING: SUPABASE_JWT_SECRET not set. Token verification may fail.")
    print("Get this from: Supabase Dashboard > Settings > API > JWT Secret")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Verify JWT token and return user information.
    Raises HTTPException if token is invalid or user not found.
    """
    token = credentials.credentials
    
    try:
        # Verify JWT token manually using Supabase JWT secret
        if not JWT_SECRET:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JWT secret not configured"
            )
        
        # Decode and verify JWT token
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user from Supabase using service role (bypasses RLS)
        try:
            user_response = supabase_storage.auth.admin.get_user_by_id(user_id)
            
            if not user_response or not user_response.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            user = user_response.user
            
        except Exception as e:
            # Fallback: try to get user info from token payload
            email = payload.get("email")
            if not email:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing user information",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Create minimal user object from token
            user = type('User', (), {
                'id': user_id,
                'email': email
            })()
        
        # Get user role from database
        try:
            role_response = supabase.table("user_roles").select("*").eq("user_id", user_id).single().execute()
            role = role_response.data.get("role", "customer") if role_response.data else "customer"
        except Exception:
            # If role not found, default to customer
            role = "customer"
        
        user_data = {
            "id": user_id,
            "email": getattr(user, 'email', payload.get("email", "")),
            "role": role
        }
        
        return user_data
        
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    Verify that the current user is an admin.
    Raises HTTPException if user is not an admin.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[dict]:
    """
    Optionally get current user if token is provided.
    Returns None if no token is provided (for public routes).
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None

