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
    Uses manual JWT verification with proper error handling and token validation.
    Raises HTTPException if token is invalid or user not found.
    """
    token = credentials.credentials
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # Verify JWT token manually using Supabase JWT secret
        if not JWT_SECRET:
            print("ERROR: JWT_SECRET not configured")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JWT secret not configured. Please set SUPABASE_JWT_SECRET environment variable."
            )
        
        # Decode and verify JWT token
        # Verify both signature and expiration
        try:
            import time
            # Decode and verify the token (includes expiration check)
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            
            # Additional expiration check (jwt.decode should handle this, but double-check)
            exp = payload.get("exp")
            if exp and time.time() >= exp:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has expired",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError as jwt_err:
            print(f"JWT decode error: {str(jwt_err)}")
            print(f"Token (first 50 chars): {token[:50]}...")
            print(f"JWT_SECRET configured: {bool(JWT_SECRET)}")
            print(f"JWT_SECRET length: {len(JWT_SECRET) if JWT_SECRET else 0}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid authentication token: {str(jwt_err)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            print(f"Unexpected error during JWT decode: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token verification failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload: missing user ID",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user from Supabase using service role (bypasses RLS)
        user_email = payload.get("email", "")
        try:
            user_response = supabase_storage.auth.admin.get_user_by_id(user_id)
            
            if user_response and user_response.user:
                user = user_response.user
                user_email = getattr(user, 'email', user_email)
            else:
                # User not found in auth, but we have token - use token data
                print(f"Warning: User {user_id} not found in Supabase Auth, using token data")
                user = type('User', (), {
                    'id': user_id,
                    'email': user_email
                })()
            
        except Exception as e:
            # Fallback: use token payload if we can't get user from Supabase
            print(f"Warning: Could not fetch user from Supabase: {str(e)}")
            print("Using token payload data")
            user = type('User', (), {
                'id': user_id,
                'email': user_email
            })()
        
        # Get user role from database using service role client to bypass RLS
        try:
            role_response = supabase_storage.table("user_roles").select("*").eq("user_id", user_id).single().execute()
            role = role_response.data.get("role", "customer") if role_response.data else "customer"
        except Exception as e:
            # If role not found, default to customer
            # Log the error for debugging
            print(f"Error fetching user role for user {user_id}: {str(e)}")
            print("Defaulting to 'customer' role")
            role = "customer"
        
        user_data = {
            "id": user_id,
            "email": user_email or getattr(user, 'email', ''),
            "role": role
        }
        
        return user_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Authentication error: {str(e)}")
        import traceback
        traceback.print_exc()
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

