"""
Authentication endpoints
Handles user registration, login, and user management
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import supabase, supabase_storage
from auth import get_current_user, get_current_admin
import uuid
from datetime import datetime

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
async def register(user_data: UserRegister):
    """
    Register a new user (customer by default).
    Admin users must be created manually or through admin panel.
    """
    try:
        # Create user in Supabase Auth
        auth_response = supabase_storage.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": True  # Auto-confirm email for now
        })
        
        if not auth_response or not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user"
            )
        
        user = auth_response.user
        
        # Create user role entry (default to customer)
        try:
            supabase.table("user_roles").insert({
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
        
        # Sign in the user to get session token
        sign_in_response = supabase_storage.auth.sign_in_with_password({
            "email": user_data.email,
            "password": user_data.password
        })
        
        if not sign_in_response or not sign_in_response.session:
            return {
                "message": "User created successfully. Please log in.",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "role": "customer"
                }
            }
        
        return {
            "message": "User registered successfully",
            "user": {
                "id": user.id,
                "email": user.email,
                "role": "customer"
            },
            "session": {
                "access_token": sign_in_response.session.access_token,
                "refresh_token": sign_in_response.session.refresh_token,
                "expires_in": sign_in_response.session.expires_in
            }
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
async def login(credentials: UserLogin):
    """
    Login user and return session token.
    Note: Frontend should use Supabase client for login in production.
    This endpoint is for backend token generation if needed.
    """
    try:
        # Sign in with Supabase
        response = supabase_storage.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        user = response.user
        
        # Get user role using service role client to bypass RLS
        try:
            # Use execute() and check if data exists (maybeSingle() not available in this Supabase client version)
            role_response = supabase_storage.table("user_roles").select("*").eq("user_id", user.id).execute()
            role = role_response.data[0].get("role", "customer") if role_response.data and len(role_response.data) > 0 else "customer"
        except Exception as e:
            print(f"Error fetching user role for user {user.id}: {str(e)}")
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
        if "invalid" in error_msg.lower() or "password" in error_msg.lower():
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
    """
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "role": current_user["role"]
    }


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Logout user (client should clear token).
    Note: With JWT tokens, logout is handled client-side by removing the token.
    """
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
    Get all users with their roles (admin only).
    Returns list of users for assignment purposes.
    """
    try:
        # Get all user roles
        roles_response = supabase.table("user_roles").select("*, auth.users!inner(email)").execute()
        
        users = []
        for role_data in (roles_response.data or []):
            user_id = role_data.get("user_id")
            user_role = role_data.get("role", "customer")
            
            # Get user email from auth.users (if available in the join)
            user_email = None
            if "auth.users" in role_data and role_data["auth.users"]:
                user_email = role_data["auth.users"].get("email")
            else:
                # Fallback: try to get from Supabase Auth
                try:
                    user_response = supabase_storage.auth.admin.get_user_by_id(user_id)
                    if user_response and user_response.user:
                        user_email = user_response.user.email
                except:
                    pass
            
            users.append({
                "id": user_id,
                "email": user_email or f"user_{user_id[:8]}",
                "role": user_role
            })
        
        return users
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get users: {str(e)}"
        )

