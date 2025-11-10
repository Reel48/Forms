"""
Authentication endpoints
Handles user registration, login, and user management
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import supabase, supabase_storage, supabase_url, supabase_service_role_key
from auth import get_current_user, get_current_admin
import uuid
from datetime import datetime
import requests

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
    Get all users with their roles and clients (admin only).
    Returns list of users and clients for assignment purposes.
    Includes clients that can be linked to users.
    """
    try:
        users = []
        client_users = {}  # Track which clients have linked users
        
        # Get all user roles and fetch emails from Supabase Auth
        # Use service role client to bypass RLS
        roles_response = supabase_storage.table("user_roles").select("*").execute()
        
        for role_data in (roles_response.data or []):
            user_id = role_data.get("user_id")
            user_role = role_data.get("role", "customer")
            
            # Get user email from Supabase Auth
            # If admin API fails, we'll skip this user (they won't appear in the list)
            user_email = None
            try:
                user_response = supabase_storage.auth.admin.get_user_by_id(user_id)
                if user_response and user_response.user:
                    user_email = user_response.user.email
            except Exception as e:
                # Log but continue - some users might not be accessible via admin API
                # This can happen if service role key doesn't have proper permissions
                print(f"Warning: Could not fetch user {user_id} from auth API: {e}")
                # Skip this user - they won't appear in the assignment list
                continue
            
            if user_email:
                users.append({
                    "id": user_id,
                    "email": user_email,
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
                    client_users[linked_user_id] = {
                        "client_id": client_id,
                        "client_name": client_name,
                        "client_email": client_email
                    }
                elif client_email:
                    # Client without linked user - add as potential user
                    users.append({
                        "id": f"client_{client_id}",  # Use prefix to distinguish
                        "email": client_email,
                        "name": client_name,
                        "client_id": client_id,
                        "role": "customer",
                        "type": "client"  # Indicates this is a client without a user account
                    })
        except Exception as e:
            print(f"Error fetching clients: {e}")
            # Continue without clients if there's an error
        
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
        client_response = supabase.table("clients").select("*").eq("id", request.client_id).execute()
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
        
        # Check if user with this email already exists by checking user_roles
        # and then fetching from auth
        try:
            # First check if there's a user_roles entry with matching email
            # We'll need to check auth.users by trying to find the user
            # Since we can't easily list all users, we'll try to create and catch the error
            # Or we can check user_roles and fetch each user
            roles_response = supabase.table("user_roles").select("user_id").execute()
            for role_entry in (roles_response.data or []):
                user_id = role_entry.get("user_id")
                try:
                    user_response = supabase_storage.auth.admin.get_user_by_id(user_id)
                    if user_response and user_response.user and user_response.user.email == client_email:
                        # Found existing user with this email - link to client
                        supabase.table("clients").update({"user_id": user_id}).eq("id", request.client_id).execute()
                        return {
                            "message": "Linked existing user to client",
                            "user_id": user_id,
                            "email": client_email
                        }
                except:
                    continue
        except Exception as e:
            print(f"Error checking existing users: {e}")
        
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
            error_detail = "Failed to create user"
            try:
                error_data = e.response.json()
                error_message = error_data.get("msg", error_data.get("message", str(e)))
                error_detail = f"Failed to create user: {error_message}"
            except:
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

