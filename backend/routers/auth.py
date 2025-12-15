"""
Authentication endpoints
Handles user registration, login, and user management
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import supabase, supabase_storage, supabase_url, supabase_service_role_key
from auth import get_current_user, get_current_admin
from email_service import email_service
from password_utils import validate_password_strength
from account_lockout import (
    check_account_locked,
    increment_failed_attempts,
    reset_failed_attempts,
    record_login_attempt
)
from token_utils import revoke_token, revoke_all_user_tokens, revoke_token_hash, hash_token
from password_history_utils import check_password_history, add_password_to_history
from rate_limiter import (
    login_rate_limit,
    register_rate_limit,
    password_reset_rate_limit,
    password_reset_confirm_rate_limit
)
from fastapi import Request
import uuid
from datetime import datetime, timedelta
import requests
import secrets
import os
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    role: str


@router.post("/register", response_model=dict)
@register_rate_limit()
async def register(user_data: UserRegister, request: Request):
    """
    Register a new user (customer by default).
    Admin users must be created manually or through admin panel.
    """
    try:
        # Validate password strength
        is_valid, error_msg = validate_password_strength(user_data.password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        
        # Create user in Supabase Auth (email not confirmed - requires verification)
        auth_response = supabase_storage.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": False  # Require email verification
        })
        
        if not auth_response or not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user"
            )
        
        user = auth_response.user
        
        # Create user role entry (default to customer)
        try:
            supabase_storage.table("user_roles").insert({
                "id": str(uuid.uuid4()),
                "user_id": user.id,
                "role": "customer",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }).execute()
        except Exception as e:
            # If role creation fails, try to delete the auth user
            try:
                supabase_storage.auth.admin.delete_user(user.id)
            except:
                pass
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user role: {str(e)}"
            )
        
        # Create client record for self-registered user
        # Check if client already exists (in case admin created client first)
        try:
            existing_client = supabase_storage.table("clients").select("*").eq("user_id", user.id).execute()
            if not existing_client.data or len(existing_client.data) == 0:
                # No existing client, create one
                client_name = user_data.name if user_data.name else user.email.split("@")[0]
                supabase_storage.table("clients").insert({
                    "name": client_name,
                    "email": user.email,
                    "user_id": user.id,
                    "registration_source": "self_registered"
                }).execute()
            else:
                # Client exists, update registration_source if it was admin_created
                existing = existing_client.data[0]
                if existing.get("registration_source") == "admin_created":
                    supabase_storage.table("clients").update({
                        "registration_source": "self_registered"
                    }).eq("id", existing["id"]).execute()
        except Exception as e:
            # Log error but don't fail registration - client record can be created later
            logger.warning("Failed to create/update client record during registration for user %s: %s", user.id, str(e))
        
        # Generate email verification token
        verification_token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(hours=24)
        
        # Store verification token
        try:
            supabase_storage.table("email_verification_tokens").insert({
                "user_id": user.id,
                "token": verification_token,
                "expires_at": expires_at.isoformat(),
                "verified": False
            }).execute()
        except Exception as e:
            logger.error(f"Failed to create verification token: {str(e)}")
            # Continue anyway - we can resend verification email
        
        # Send verification email
        try:
            email_sent = email_service.send_email_verification(
                to_email=user.email,
                verification_token=verification_token,
                user_name=user_data.name
            )
            if not email_sent:
                logger.warning(f"Failed to send verification email to {user.email}")
        except Exception as e:
            logger.error(f"Error sending verification email: {str(e)}")
        
        # Don't sign in automatically - require email verification first
        return {
            "message": "User registered successfully. Please check your email to verify your account.",
            "user": {
                "id": user.id,
                "email": user.email,
                "role": "customer",
                "email_verified": False
            },
            "requires_verification": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg.lower() or "already exists" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {error_msg}"
        )


@router.post("/login", response_model=dict)
@login_rate_limit()
async def login(credentials: UserLogin, request: Request):
    """
    Login user and return session token.
    Note: Frontend should use Supabase client for login in production.
    This endpoint is for backend token generation if needed.
    """
    # Get IP address from request
    ip_address = request.client.host if request.client else None
    if request.headers.get("x-forwarded-for"):
        ip_address = request.headers.get("x-forwarded-for").split(",")[0].strip()
    
    user_id = None
    try:
        # Check if account is locked
        is_locked, lockout_message = check_account_locked(credentials.email)
        if is_locked:
            # Record failed attempt (account locked)
            record_login_attempt(
                email=credentials.email,
                user_id=None,
                ip_address=ip_address,
                success=False,
                failure_reason="account_locked"
            )
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=lockout_message or "Account is locked due to too many failed login attempts. Please try again later."
            )
        
        # Sign in with Supabase
        response = supabase_storage.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not response or not response.user:
            # Login failed - increment failed attempts
            increment_failed_attempts(credentials.email, user_id)
            record_login_attempt(
                email=credentials.email,
                user_id=None,
                ip_address=ip_address,
                success=False,
                failure_reason="invalid_credentials"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        user = response.user
        user_id = user.id
        
        # Check if email is verified
        if not hasattr(user, 'email_confirmed_at') or not user.email_confirmed_at:
            # Email not verified - increment failed attempts (treat as failed login)
            increment_failed_attempts(credentials.email, user_id)
            record_login_attempt(
                email=credentials.email,
                user_id=user_id,
                ip_address=ip_address,
                success=False,
                failure_reason="email_not_verified"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please verify your email address before logging in. Check your inbox for a verification link."
            )
        
        # Login successful - reset failed attempts
        reset_failed_attempts(credentials.email, user_id)
        record_login_attempt(
            email=credentials.email,
            user_id=user_id,
            ip_address=ip_address,
            success=True
        )
        
        # Track session
        try:
            from jose import jwt
            
            # Get user agent
            user_agent = request.headers.get("user-agent", "")
            
            # Parse device info from user agent (basic)
            device_info = {}
            if "Mobile" in user_agent or "Android" in user_agent or "iPhone" in user_agent:
                device_info["type"] = "mobile"
            elif "Tablet" in user_agent or "iPad" in user_agent:
                device_info["type"] = "tablet"
            else:
                device_info["type"] = "desktop"
            
            # Extract browser info
            if "Chrome" in user_agent:
                device_info["browser"] = "Chrome"
            elif "Firefox" in user_agent:
                device_info["browser"] = "Firefox"
            elif "Safari" in user_agent:
                device_info["browser"] = "Safari"
            elif "Edge" in user_agent:
                device_info["browser"] = "Edge"
            else:
                device_info["browser"] = "Unknown"
            
            # Get token expiration
            access_token = response.session.access_token
            token_hash = hash_token(access_token)
            refresh_token_hash = hash_token(response.session.refresh_token) if response.session.refresh_token else None
            
            try:
                payload = jwt.decode(access_token, options={"verify_signature": False})
                exp = payload.get("exp")
                if exp:
                    expires_at = datetime.fromtimestamp(exp)
                else:
                    expires_at = datetime.now() + timedelta(hours=1)
            except:
                expires_at = datetime.now() + timedelta(hours=1)
            
            # Check if session already exists
            existing_session = supabase_storage.table("user_sessions").select("*").eq("token_hash", token_hash).execute()
            
            if not existing_session.data or len(existing_session.data) == 0:
                # Create new session
                supabase_storage.table("user_sessions").insert({
                    "user_id": user_id,
                    "token_hash": token_hash,
                    "refresh_token_hash": refresh_token_hash,
                    "ip_address": ip_address,
                    "user_agent": user_agent,
                    "device_info": json.dumps(device_info),
                    "created_at": datetime.now().isoformat(),
                    "last_used_at": datetime.now().isoformat(),
                    "expires_at": expires_at.isoformat(),
                    "is_active": True
                }).execute()
            else:
                # Update last used time
                supabase_storage.table("user_sessions").update({
                    "last_used_at": datetime.now().isoformat()
                }).eq("token_hash", token_hash).execute()
        except Exception as e:
            logger.warning(f"Failed to track session: {str(e)}")
            # Don't fail login if session tracking fails
        
        # Get user role using service role client to bypass RLS
        try:
            # Use execute() and check if data exists (maybeSingle() not available in this Supabase client version)
            role_response = supabase_storage.table("user_roles").select("*").eq("user_id", user.id).execute()
            role = role_response.data[0].get("role", "customer") if role_response.data and len(role_response.data) > 0 else "customer"
        except Exception as e:
            logger.warning("Error fetching user role for user %s: %s", user.id, str(e))
            role = "customer"
        
        return {
            "user": {
                "id": user.id,
                "email": user.email,
                "role": role
            },
            "session": {
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token,
                "expires_in": response.session.expires_in
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        # If it's an auth error from Supabase, increment failed attempts
        if "invalid" in error_msg.lower() or "password" in error_msg.lower() or "credentials" in error_msg.lower():
            increment_failed_attempts(credentials.email, user_id)
            record_login_attempt(
                email=credentials.email,
                user_id=user_id,
                ip_address=ip_address,
                success=False,
                failure_reason="invalid_credentials"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {error_msg}"
        )


@router.get("/me", response_model=dict)
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user information.
    Also ensures client record exists and registration_source is correct.
    """
    user_id = current_user.get("id")
    user_email = current_user.get("email", "")
    
    # Ensure client record exists and registration_source is correct
    if user_id:
        try:
            # Check if client record exists for this user
            client_response = supabase_storage.table("clients").select("*").eq("user_id", user_id).execute()
            
            if client_response.data and len(client_response.data) > 0:
                # Client exists, check if registration_source needs updating
                client = client_response.data[0]
                if client.get("registration_source") == "admin_created":
                    # User has logged in, so they must have registered themselves
                    # Update registration_source to self_registered
                    supabase_storage.table("clients").update({
                        "registration_source": "self_registered"
                    }).eq("id", client["id"]).execute()
            else:
                # No client record exists, create one
                # Check if there's a client with the same email (admin-created, not linked)
                # Fetch all clients with this email and filter for null user_id in Python
                email_client_response = supabase_storage.table("clients").select("*").eq("email", user_email).execute()
                
                # Filter for clients with null user_id
                unlinked_clients = [c for c in (email_client_response.data or []) if c.get("user_id") is None]
                
                if unlinked_clients and len(unlinked_clients) > 0:
                    # Found client with same email, link it to this user
                    existing_client = unlinked_clients[0]
                    supabase_storage.table("clients").update({
                        "user_id": user_id,
                        "registration_source": "self_registered"
                    }).eq("id", existing_client["id"]).execute()
                else:
                    # Create new client record
                    user_name = current_user.get("name", "") or user_email.split("@")[0] if user_email else "User"
                    supabase_storage.table("clients").insert({
                        "name": user_name,
                        "email": user_email,
                        "user_id": user_id,
                        "registration_source": "self_registered"
                    }).execute()
        except Exception as e:
            # Log error but don't fail the /me endpoint
            logger.warning("Failed to update client record in /me for user %s: %s", user_id, str(e))
    
    return {
        "id": current_user.get("id"),
        "email": current_user.get("email"),
        "role": current_user.get("role"),
        "name": current_user.get("name")
    }


@router.post("/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    """
    Logout user and revoke the current token.
    """
    try:
        # Get token from request
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            user_id = current_user.get("id")
            
            # Revoke the token
            revoke_token(token, user_id, reason="logout")
            
            # Mark session as inactive
            try:
                token_hash = hash_token(token)
                supabase_storage.table("user_sessions").update({
                    "is_active": False
                }).eq("token_hash", token_hash).execute()
            except Exception as e:
                logger.warning(f"Failed to update session on logout: {str(e)}")
        
        return {"message": "Logged out successfully"}
    except Exception as e:
        logger.error(f"Error during logout: {str(e)}")
        # Still return success even if revocation fails
        return {"message": "Logged out successfully"}


@router.post("/refresh")
async def refresh_token(refresh_token: str):
    """
    Refresh access token using refresh token.
    """
    try:
        response = supabase_storage.auth.refresh_session(refresh_token)
        
        if not response or not response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "expires_in": response.session.expires_in
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token refresh failed: {str(e)}"
        )


@router.get("/users")
async def get_users(current_admin: dict = Depends(get_current_admin)):
    """
    Get all users with their roles and clients (admin only).
    Returns list of users and clients for assignment purposes.
    Includes clients that can be linked to users.
    All users are returned regardless of existing assignments.
    """
    try:
        users = []
        user_ids_seen = set()  # Track user IDs to avoid duplicates
        client_users = {}  # Track which clients have linked users
        
        # Get all users from Supabase Auth using REST API (more reliable than individual lookups)
        if not supabase_service_role_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Service role key not configured"
            )
        
        # Fetch all users from Supabase Auth using REST API
        auth_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": supabase_service_role_key,
            "Authorization": f"Bearer {supabase_service_role_key}",
            "Content-Type": "application/json"
        }
        
        all_auth_users = {}
        try:
            # Get all users (with pagination if needed)
            response = requests.get(auth_url, headers=headers, params={"per_page": 1000}, timeout=10)
            if response.status_code == 200:
                users_data = response.json()
                for auth_user in users_data.get("users", []):
                    user_id = auth_user.get("id")
                    user_email = auth_user.get("email")
                    user_metadata = auth_user.get("user_metadata", {})
                    user_name = user_metadata.get("name")
                    
                    if user_id and user_email:
                        all_auth_users[user_id] = {
                            "email": user_email,
                            "name": user_name
                        }
        except Exception as e:
            logger.warning("Could not fetch users from auth API: %s", e)
            # Fall back to individual lookups if bulk fetch fails
            all_auth_users = {}
        
        # Get all user roles and match with auth users
        # Use service role client to bypass RLS
        roles_response = supabase_storage.table("user_roles").select("*").execute()
        
        for role_data in (roles_response.data or []):
            user_id = role_data.get("user_id")
            user_role = role_data.get("role", "customer")
            
            # Skip if we've already added this user
            if user_id in user_ids_seen:
                continue
            
            # Get user email from our auth users map or try individual lookup
            user_email = None
            user_name = None
            
            if user_id in all_auth_users:
                # Use data from bulk fetch
                user_email = all_auth_users[user_id]["email"]
                user_name = all_auth_users[user_id]["name"]
            else:
                # Fallback to individual lookup if not in bulk fetch
                try:
                    user_response = supabase_storage.auth.admin.get_user_by_id(user_id)
                    if user_response and user_response.user:
                        user_email = user_response.user.email
                        # Get name from user_metadata if available
                        if hasattr(user_response.user, 'user_metadata') and user_response.user.user_metadata:
                            user_name = user_response.user.user_metadata.get('name')
                except Exception as e:
                    # Log but continue - some users might not be accessible via admin API
                    logger.warning("Could not fetch user %s from auth API: %s", user_id, e)
                    # Skip this user - they won't appear in the assignment list
                    continue
            
            if user_email:
                user_ids_seen.add(user_id)
                users.append({
                    "id": user_id,
                    "email": user_email,
                    "name": user_name,
                    "role": user_role,
                    "type": "user"
                })
        
        # Get all clients and check which ones have linked users
        # Use service role client to bypass RLS
        try:
            clients_response = supabase_storage.table("clients").select("id, name, email, user_id").execute()
            for client in (clients_response.data or []):
                client_id = client.get("id")
                client_email = client.get("email")
                client_name = client.get("name")
                linked_user_id = client.get("user_id")
                
                if linked_user_id:
                    # Client already has a linked user - mark it
                    # The user should already be in the list from user_roles, but ensure we track it
                    client_users[linked_user_id] = {
                        "client_id": client_id,
                        "client_name": client_name,
                        "client_email": client_email
                    }
                    # If for some reason the user isn't in the list yet, we don't add them here
                    # because they should be in user_roles. But we ensure they're marked.
                elif client_email:
                    # Client without linked user - add as potential user
                    # Use a unique ID format to distinguish from regular users
                    client_prefixed_id = f"client_{client_id}"
                    if client_prefixed_id not in user_ids_seen:
                        user_ids_seen.add(client_prefixed_id)
                        users.append({
                            "id": client_prefixed_id,  # Use prefix to distinguish
                            "email": client_email,
                            "name": client_name,
                            "client_id": client_id,
                            "role": "customer",
                            "type": "client"  # Indicates this is a client without a user account
                        })
        except Exception as e:
            logger.warning("Error fetching clients: %s", e)
            # Continue without clients if there's an error
        
        # Return all users - they should always be available for assignment
        # regardless of whether they have existing assignments
        return users
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get users: {str(e)}"
        )


class CreateUserForClientRequest(BaseModel):
    client_id: str
    password: Optional[str] = None

@router.post("/users/create-for-client")
async def create_user_for_client(
    request: CreateUserForClientRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Create an auth user for a client (admin only).
    If password is not provided, generates a random one.
    """
    try:
        # Get client information
        client_response = supabase_storage.table("clients").select("*").eq("id", request.client_id).execute()
        if not client_response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client = client_response.data[0]
        client_email = client.get("email")
        client_name = client.get("name")
        
        if not client_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client must have an email address to create a user account"
            )
        
        # Check if client already has a linked user
        if client.get("user_id"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client already has a linked user account"
            )
        
        # Helper function to find user by email using REST API
        def find_user_by_email(email: str):
            """Find a user by email using Supabase Admin API"""
            if not supabase_service_role_key:
                return None
            
            # Use Supabase Auth Admin API to list users and find by email
            # Note: Supabase doesn't have a direct "get by email" endpoint, so we list and filter
            list_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": supabase_service_role_key,
                "Authorization": f"Bearer {supabase_service_role_key}",
                "Content-Type": "application/json"
            }
            
            try:
                # List users (we'll need to paginate if there are many)
                # For now, we'll try to get users and search
                response = requests.get(list_url, headers=headers, params={"per_page": 1000}, timeout=10)
                if response.status_code == 200:
                    users_data = response.json()
                    users = users_data.get("users", [])
                    for user in users:
                        if user.get("email", "").lower() == email.lower():
                            return user
            except Exception as e:
                logger.warning("Error searching for user by email: %s", e)
            
            return None
        
        # Check if user with this email already exists
        existing_user = find_user_by_email(client_email)
        if existing_user:
            # User already exists - link to client
            user_id = existing_user.get("id")
            
            # Ensure user has a role entry (create if missing)
            try:
                role_check = supabase_storage.table("user_roles").select("*").eq("user_id", user_id).execute()
                if not role_check.data or len(role_check.data) == 0:
                    # Create role entry
                    supabase_storage.table("user_roles").insert({
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "role": "customer",
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat()
                    }).execute()
            except Exception as e:
                logger.warning("Could not ensure user role exists: %s", e)
            
            # Link user to client
            supabase_storage.table("clients").update({"user_id": user_id}).eq("id", request.client_id).execute()
            
            return {
                "message": "Linked existing user to client",
                "user_id": user_id,
                "email": client_email
            }
        
        # Generate password if not provided
        password = request.password
        if not password:
            import secrets
            import string
            alphabet = string.ascii_letters + string.digits
            password = ''.join(secrets.choice(alphabet) for i in range(12))
        
        # Create user in Supabase Auth using REST API directly
        # The Python client's admin.create_user() may not work correctly
        if not supabase_service_role_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Service role key not configured. Cannot create users."
            )
        
        # Use Supabase Auth Admin API directly via REST
        auth_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": supabase_service_role_key,
            "Authorization": f"Bearer {supabase_service_role_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "email": client_email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "name": client_name,
                "client_id": request.client_id
            }
        }
        
        try:
            response = requests.post(auth_url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            user_data = response.json()
            
            if not user_data or "id" not in user_data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to create user: Invalid response from Supabase"
                )
            
            user_id = user_data["id"]
            user_email = user_data.get("email", client_email)
            
        except requests.exceptions.HTTPError as e:
            # Check if error is "user already exists"
            error_message = None
            try:
                error_data = e.response.json()
                error_message = error_data.get("msg", error_data.get("message", ""))
            except:
                pass
            
            # If user already exists, try to find and link them
            if error_message and ("already registered" in error_message.lower() or "already exists" in error_message.lower()):
                existing_user = find_user_by_email(client_email)
                if existing_user:
                    user_id = existing_user.get("id")
                    
                    # Ensure user has a role entry (create if missing)
                    try:
                        role_check = supabase_storage.table("user_roles").select("*").eq("user_id", user_id).execute()
                        if not role_check.data or len(role_check.data) == 0:
                            supabase_storage.table("user_roles").insert({
                                "id": str(uuid.uuid4()),
                                "user_id": user_id,
                                "role": "customer",
                                "created_at": datetime.now().isoformat(),
                                "updated_at": datetime.now().isoformat()
                            }).execute()
                    except Exception as e:
                        logger.warning("Could not ensure user role exists: %s", e)
                    
                    # Link user to client
                    supabase_storage.table("clients").update({"user_id": user_id}).eq("id", request.client_id).execute()
                    
                    return {
                        "message": "Linked existing user to client",
                        "user_id": user_id,
                        "email": client_email
                    }
            
            # If we couldn't find the user or it's a different error, raise the exception
            error_detail = "Failed to create user"
            if error_message:
                error_detail = f"Failed to create user: {error_message}"
            else:
                error_detail = f"Failed to create user: {str(e)}"
            
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_detail
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user: {str(e)}"
            )
        
        # Create user role entry (default to customer)
        try:
            supabase_storage.table("user_roles").insert({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "role": "customer",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }).execute()
        except Exception as e:
            # If role creation fails, try to delete the auth user
            try:
                delete_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
                requests.delete(delete_url, headers=headers, timeout=10)
            except:
                pass
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user role: {str(e)}"
            )
        
        # Link user to client
        supabase_storage.table("clients").update({"user_id": user_id}).eq("id", request.client_id).execute()
        
        return {
            "message": "User created and linked to client",
            "user_id": user_id,
            "email": user_email,
            "password": password  # Return password so admin can share it
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user for client: {str(e)}"
        )


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class EmailVerificationRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


@router.post("/password-reset/request")
@password_reset_rate_limit()
async def request_password_reset(request_data: PasswordResetRequest, request: Request):
    """
    Request a password reset. Sends an email with a reset link.
    """
    try:
        # Check if user exists
        # Use Supabase Auth Admin API to find user by email
        if not supabase_service_role_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Service role key not configured"
            )
        
        # Search for user by email using Supabase Auth Admin API
        auth_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": supabase_service_role_key,
            "Authorization": f"Bearer {supabase_service_role_key}",
            "Content-Type": "application/json"
        }
        
        # List users and find by email
        response = requests.get(auth_url, headers=headers, params={"per_page": 1000}, timeout=10)
        user = None
        if response.status_code == 200:
            users_data = response.json()
            users = users_data.get("users", [])
            for u in users:
                if u.get("email", "").lower() == request_data.email.lower():
                    user = u
                    break
        
        # Always return success to prevent email enumeration
        # But only send email if user exists
        if user:
            user_id = user.get("id")
            user_email = user.get("email")
            user_metadata = user.get("user_metadata", {})
            user_name = user_metadata.get("name")
            
            # Generate a secure reset token
            reset_token = secrets.token_urlsafe(32)
            
            # Store reset token in database with expiration (1 hour)
            expires_at = datetime.now() + timedelta(hours=1)
            
            # Create or update password_reset_tokens table entry
            try:
                # Insert token into password_reset_tokens table
                # Note: id and created_at are auto-generated by the database
                token_data = {
                    "user_id": user_id,
                    "token": reset_token,
                    "expires_at": expires_at.isoformat(),
                    "used": False
                }
                
                # Insert the token
                supabase_storage.table("password_reset_tokens").insert(token_data).execute()
                logger.info(f"Password reset token created for user {user_id}")
                
                # Send password reset email
                logger.info(f"Attempting to send password reset email to {user_email}")
                email_sent = email_service.send_password_reset_email(
                    to_email=user_email,
                    reset_token=reset_token,
                    user_name=user_name
                )
                
                if email_sent:
                    logger.info(f"Password reset email sent successfully to {user_email}")
                else:
                    # Log detailed error - email might be disabled in dev
                    logger.error(f"Failed to send password reset email to {user_email}")
                    logger.error("Password reset email failed to send (reset link redacted). Frontend base: %s", os.getenv('FRONTEND_URL', 'http://localhost:5173'))
                    # Do not print or expose reset tokens; check server logs for delivery issues.
                
            except Exception as e:
                logger.error(f"Error in password reset flow: {str(e)}", exc_info=True)
                # Continue anyway - we'll still try to send email
        
        # Always return success to prevent email enumeration attacks
        return {
            "message": "If an account with that email exists, a password reset link has been sent."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Always return success to prevent email enumeration
        logger.error("Error in password reset request: %s", str(e))
        return {
            "message": "If an account with that email exists, a password reset link has been sent."
        }


@router.post("/password-reset/confirm")
@password_reset_confirm_rate_limit()
async def confirm_password_reset(reset_data: PasswordResetConfirm, request: Request):
    """
    Confirm password reset with token and new password.
    """
    try:
        # Validate password strength
        is_valid, error_msg = validate_password_strength(reset_data.new_password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        
        # Check password history (will be done after we get user_id)
        
        if not supabase_service_role_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Service role key not configured"
            )
        
        # Verify reset token
        try:
            # Query password_reset_tokens table
            token_response = supabase_storage.table("password_reset_tokens").select("*").eq("token", reset_data.token).eq("used", False).execute()
            
            if not token_response.data or len(token_response.data) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired reset token"
                )
            
            token_record = token_response.data[0]
            user_id = token_record.get("user_id")
            expires_at_str = token_record.get("expires_at")
            
            # Check if token is expired
            if expires_at_str:
                try:
                    # Handle timezone-aware datetime
                    if expires_at_str.endswith('Z'):
                        expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
                    else:
                        expires_at = datetime.fromisoformat(expires_at_str)
                    
                    # Make current time timezone-aware if expires_at is timezone-aware
                    now = datetime.now(expires_at.tzinfo) if expires_at.tzinfo else datetime.now()
                    if now > expires_at:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Reset token has expired"
                        )
                except ValueError as e:
                    # If datetime parsing fails, consider token invalid
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid token expiration format: {str(e)}"
                    )
            
            # Check password history before updating
            if check_password_history(user_id, reset_data.new_password):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You cannot reuse a recently used password. Please choose a different password."
                )
            
            # Update user password using Supabase Auth Admin API
            auth_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
            headers = {
                "apikey": supabase_service_role_key,
                "Authorization": f"Bearer {supabase_service_role_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "password": reset_data.new_password
            }
            
            response = requests.put(auth_url, json=payload, headers=headers, timeout=10)
            
            if response.status_code not in [200, 201]:
                error_data = response.json() if response.content else {}
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to reset password: {error_data.get('msg', 'Unknown error')}"
                )
            
            # Mark token as used
            try:
                supabase_storage.table("password_reset_tokens").update({"used": True}).eq("id", token_record["id"]).execute()
            except Exception as e:
                # Log but don't fail - token is already used
                logger.warning("Failed to mark reset token as used: %s", str(e))
            
            # Add password to history
            try:
                add_password_to_history(user_id, reset_data.new_password)
            except Exception as e:
                logger.warning(f"Failed to add password to history: {str(e)}")
                # Don't fail password reset if history update fails
            
            return {
                "message": "Password reset successfully"
            }
            
        except HTTPException:
            raise
        except Exception as token_error:
            # If table doesn't exist or query fails, provide helpful error
            error_msg = str(token_error)
            if "relation" in error_msg.lower() and "does not exist" in error_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Password reset system not fully configured. Please run database migration."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid or expired reset token: {error_msg}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset password: {str(e)}"
        )


@router.post("/verify-email")
async def verify_email(verification_data: EmailVerificationRequest):
    """
    Verify email address using verification token.
    """
    try:
        if not supabase_service_role_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Service role key not configured"
            )
        
        # Verify verification token
        try:
            token_response = supabase_storage.table("email_verification_tokens").select("*").eq("token", verification_data.token).eq("verified", False).execute()
            
            if not token_response.data or len(token_response.data) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid or expired verification token"
                )
            
            token_record = token_response.data[0]
            user_id = token_record.get("user_id")
            expires_at_str = token_record.get("expires_at")
            
            # Check if token is expired
            if expires_at_str:
                try:
                    if expires_at_str.endswith('Z'):
                        expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
                    else:
                        expires_at = datetime.fromisoformat(expires_at_str)
                    
                    now = datetime.now(expires_at.tzinfo) if expires_at.tzinfo else datetime.now()
                    if now > expires_at:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Verification token has expired. Please request a new verification email."
                        )
                except ValueError as e:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid token expiration format: {str(e)}"
                    )
            
            # Update user email to confirmed in Supabase Auth
            auth_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
            headers = {
                "apikey": supabase_service_role_key,
                "Authorization": f"Bearer {supabase_service_role_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "email_confirm": True
            }
            
            response = requests.put(auth_url, json=payload, headers=headers, timeout=10)
            
            if response.status_code not in [200, 201]:
                error_data = response.json() if response.content else {}
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to verify email: {error_data.get('msg', 'Unknown error')}"
                )
            
            # Mark token as verified
            try:
                supabase_storage.table("email_verification_tokens").update({"verified": True}).eq("id", token_record["id"]).execute()
            except Exception as e:
                logger.warning(f"Failed to mark verification token as verified: {str(e)}")
            
            return {
                "message": "Email verified successfully. You can now log in."
            }
            
        except HTTPException:
            raise
        except Exception as token_error:
            error_msg = str(token_error)
            if "relation" in error_msg.lower() and "does not exist" in error_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Email verification system not fully configured. Please run database migration."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid or expired verification token: {error_msg}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify email: {str(e)}"
        )


@router.post("/resend-verification")
@password_reset_rate_limit()  # Use same rate limit as password reset
async def resend_verification_email(request_data: ResendVerificationRequest, request: Request):
    """
    Resend email verification link.
    """
    try:
        if not supabase_service_role_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Service role key not configured"
            )
        
        # Find user by email
        auth_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": supabase_service_role_key,
            "Authorization": f"Bearer {supabase_service_role_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(auth_url, headers=headers, params={"per_page": 1000}, timeout=10)
        user = None
        if response.status_code == 200:
            users_data = response.json()
            users = users_data.get("users", [])
            for u in users:
                if u.get("email", "").lower() == request_data.email.lower():
                    user = u
                    break
        
        # Always return success to prevent email enumeration
        if user:
            user_id = user.get("id")
            user_email = user.get("email")
            user_metadata = user.get("user_metadata", {})
            user_name = user_metadata.get("name")
            
            # Check if email is already verified
            if user.get("email_confirmed_at"):
                # Email already verified, but return success anyway
                return {
                    "message": "If an account with that email exists and is unverified, a verification link has been sent."
                }
            
            # Generate new verification token
            verification_token = secrets.token_urlsafe(32)
            expires_at = datetime.now() + timedelta(hours=24)
            
            # Invalidate old tokens for this user
            try:
                supabase_storage.table("email_verification_tokens").update({"verified": True}).eq("user_id", user_id).eq("verified", False).execute()
            except:
                pass
            
            # Store new verification token
            try:
                supabase_storage.table("email_verification_tokens").insert({
                    "user_id": user_id,
                    "token": verification_token,
                    "expires_at": expires_at.isoformat(),
                    "verified": False
                }).execute()
                
                # Send verification email
                email_sent = email_service.send_email_verification(
                    to_email=user_email,
                    verification_token=verification_token,
                    user_name=user_name
                )
                
                if email_sent:
                    logger.info(f"Verification email resent to {user_email}")
            except Exception as e:
                logger.error(f"Error resending verification email: {str(e)}")
        
        # Always return success
        return {
            "message": "If an account with that email exists and is unverified, a verification link has been sent."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Always return success to prevent email enumeration
        logger.error(f"Error in resend verification: {str(e)}")
        return {
            "message": "If an account with that email exists and is unverified, a verification link has been sent."
        }


@router.get("/login-activity")
async def get_login_activity(
    current_user: dict = Depends(get_current_user),
    limit: int = 20
):
    """
    Get recent login activity for the current user.
    """
    try:
        user_id = current_user.get("id")
        
        # Get recent login attempts for this user
        response = supabase_storage.table("login_attempts").select("*").eq("user_id", user_id).order("attempted_at", desc=True).limit(limit).execute()
        
        activities = []
        if response.data:
            for attempt in response.data:
                activities.append({
                    "id": attempt.get("id"),
                    "success": attempt.get("success", False),
                    "ip_address": attempt.get("ip_address"),
                    "attempted_at": attempt.get("attempted_at"),
                    "failure_reason": attempt.get("failure_reason")
                })
        
        return {
            "activities": activities,
            "total": len(activities)
        }
    except Exception as e:
        logger.error(f"Error fetching login activity: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch login activity: {str(e)}"
        )


@router.get("/sessions")
async def get_sessions(current_user: dict = Depends(get_current_user)):
    """
    Get all active sessions for the current user.
    """
    try:
        user_id = current_user.get("id")
        
        # Get active sessions
        response = supabase_storage.table("user_sessions").select("*").eq("user_id", user_id).eq("is_active", True).order("last_used_at", desc=True).execute()
        
        sessions = []
        if response.data:
            for session in response.data:
                sessions.append({
                    "id": session.get("id"),
                    "ip_address": session.get("ip_address"),
                    "user_agent": session.get("user_agent"),
                    "device_info": session.get("device_info"),
                    "location_info": session.get("location_info"),
                    "created_at": session.get("created_at"),
                    "last_used_at": session.get("last_used_at"),
                    "expires_at": session.get("expires_at")
                })
        
        return {
            "sessions": sessions,
            "total": len(sessions)
        }
    except Exception as e:
        logger.error(f"Error fetching sessions: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch sessions: {str(e)}"
        )


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Revoke a specific session.
    """
    try:
        user_id = current_user.get("id")
        
        # Verify session belongs to user
        session_response = supabase_storage.table("user_sessions").select("*").eq("id", session_id).eq("user_id", user_id).execute()
        
        if not session_response.data or len(session_response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        session = session_response.data[0]
        token_hash = session.get("token_hash")
        expires_at_raw = session.get("expires_at")
        
        # Mark session as inactive
        supabase_storage.table("user_sessions").update({
            "is_active": False
        }).eq("id", session_id).execute()

        # Revoke token hash so API calls with that access token are blocked immediately
        if token_hash and expires_at_raw:
            try:
                expires_at = (
                    datetime.fromisoformat(expires_at_raw.replace("Z", "+00:00"))
                    if isinstance(expires_at_raw, str)
                    else expires_at_raw
                )
                if not isinstance(expires_at, datetime):
                    expires_at = datetime.now() + timedelta(hours=1)
            except Exception:
                expires_at = datetime.now() + timedelta(hours=1)
            revoke_token_hash(token_hash, user_id, expires_at, reason="session_revoked")
        
        return {"message": "Session revoked successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking session: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke session: {str(e)}"
        )


@router.post("/logout-all")
async def logout_all_devices(current_user: dict = Depends(get_current_user)):
    """
    Logout from all devices (revoke all active sessions).
    """
    try:
        user_id = current_user.get("id")
        
        # Revoke all user tokens and mark sessions inactive
        revoked_count = revoke_all_user_tokens(user_id, reason="logout_all")
        
        return {
            "message": "Logged out from all devices successfully",
            "sessions_revoked": revoked_count
        }
    except Exception as e:
        logger.error(f"Error logging out all devices: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to logout all devices: {str(e)}"
        )

