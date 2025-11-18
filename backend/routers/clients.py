from fastapi import APIRouter, HTTPException, Depends, UploadFile, File as FastAPIFile
from typing import List, Dict, Any, Optional
import sys
import os
import uuid
import hashlib
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Client, ClientCreate
from database import supabase, supabase_storage, supabase_url, supabase_service_role_key
from stripe_service import StripeService
from auth import get_current_user
import requests

router = APIRouter(prefix="/api/clients", tags=["clients"])

@router.get("", response_model=List[Client])
async def get_clients():
    """
    Get all clients - includes both manually created clients and self-registered users.
    Returns all users from auth.users that have a customer role, creating client records
    for any that don't have one yet.
    """
    try:
        # Get all clients from clients table
        clients_response = supabase_storage.table("clients").select("*").order("name").execute()
        clients_dict = {client["id"]: client for client in clients_response.data} if clients_response.data else {}
        clients_by_user_id = {client.get("user_id"): client for client in clients_response.data if client.get("user_id")}
        
        # Get all customer users from user_roles
        user_roles_response = supabase_storage.table("user_roles").select("user_id").eq("role", "customer").execute()
        customer_user_ids = [ur["user_id"] for ur in user_roles_response.data] if user_roles_response.data else []
        
        # Fetch user details from Supabase Auth Admin API
        headers = {
            "apikey": supabase_service_role_key,
            "Authorization": f"Bearer {supabase_service_role_key}"
        }
        
        all_clients = list(clients_dict.values())
        user_ids_seen = set()
        
        # First, fix any clients that have user_id but wrong registration_source
        for client in all_clients:
            client_user_id = client.get("user_id")
            if client_user_id and client.get("registration_source") == "admin_created":
                # If client has a user_id, they must have registered themselves
                # Update registration_source to self_registered
                try:
                    supabase_storage.table("clients").update({
                        "registration_source": "self_registered"
                    }).eq("id", client["id"]).execute()
                    client["registration_source"] = "self_registered"
                except Exception as e:
                    print(f"Warning: Failed to update registration_source for client {client['id']}: {str(e)}")
        
        # For each customer user, ensure they have a client record
        for user_id in customer_user_ids:
            if user_id in user_ids_seen:
                continue
            user_ids_seen.add(user_id)
            
            # Check if client record exists for this user
            if user_id in clients_by_user_id:
                # Client exists, but make sure registration_source is correct
                client = clients_by_user_id[user_id]
                if client.get("registration_source") == "admin_created":
                    # Update to self_registered since they have a user_id
                    try:
                        supabase_storage.table("clients").update({
                            "registration_source": "self_registered"
                        }).eq("id", client["id"]).execute()
                        client["registration_source"] = "self_registered"
                    except Exception as e:
                        print(f"Warning: Failed to update registration_source for client {client['id']}: {str(e)}")
                continue  # Already have a client record
            
            # Fetch user details from Auth API
            try:
                user_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
                user_response = requests.get(user_url, headers=headers, timeout=10)
                if user_response.status_code == 200:
                    user_data = user_response.json()
                    user_email = user_data.get("email", "")
                    user_name = user_data.get("user_metadata", {}).get("name", "") or user_email.split("@")[0]
                    
                    # Check if there's a client with the same email (admin-created, not linked)
                    # Fetch all clients with this email and filter for null user_id in Python
                    email_client_response = supabase_storage.table("clients").select("*").eq("email", user_email).execute()
                    
                    # Filter for clients with null user_id
                    unlinked_clients = [c for c in (email_client_response.data or []) if c.get("user_id") is None]
                    
                    if unlinked_clients and len(unlinked_clients) > 0:
                        # Found admin-created client with same email, link it
                        existing_client = unlinked_clients[0]
                        supabase_storage.table("clients").update({
                            "user_id": user_id,
                            "registration_source": "self_registered"
                        }).eq("id", existing_client["id"]).execute()
                        existing_client["user_id"] = user_id
                        existing_client["registration_source"] = "self_registered"
                        all_clients.append(existing_client)
                    else:
                        # Create new client record
                        new_client = {
                            "name": user_name,
                            "email": user_email,
                            "user_id": user_id,
                            "registration_source": "self_registered"
                        }
                        insert_response = supabase_storage.table("clients").insert(new_client).execute()
                        if insert_response.data:
                            all_clients.append(insert_response.data[0])
            except Exception as e:
                print(f"Warning: Failed to fetch/create client for user {user_id}: {str(e)}")
                continue
        
        return all_clients
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{client_id}", response_model=Client)
async def get_client(client_id: str):
    """Get a specific client"""
    try:
        response = supabase_storage.table("clients").select("*").eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=Client)
async def create_client(client: ClientCreate):
    """Create a new client"""
    try:
        # Use model_dump() for Pydantic v2 compatibility, fallback to dict() for v1
        try:
            client_data = client.model_dump(exclude_none=True)
        except AttributeError:
            client_data = client.dict(exclude_none=True)
        
        print(f"DEBUG: Client data to insert: {client_data}")
        
        # Let Supabase generate UUID and created_at automatically
        # Only include fields that are provided
        
        # Set registration_source for admin-created clients
        if "registration_source" not in client_data:
            client_data["registration_source"] = "admin_created"
        
        # Create Stripe customer if email is provided
        stripe_customer_id = None
        if client_data.get("email"):
            try:
                stripe_customer_id = StripeService.create_or_get_customer(client_data)
                client_data["stripe_customer_id"] = stripe_customer_id
            except Exception as e:
                # Log error but don't fail client creation
                print(f"Failed to create Stripe customer: {e}")
        
        # Insert into Supabase (let it generate id and created_at)
        print(f"DEBUG: Inserting into Supabase: {client_data}")
        insert_response = supabase_storage.table("clients").insert(client_data).execute()
        
        print(f"DEBUG: Insert response: {insert_response}")
        print(f"DEBUG: Insert response data: {insert_response.data}")
        
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to create client: No data returned")
        
        # Get the created client ID
        created_client_id = insert_response.data[0]["id"]
        
        # Fetch the complete client record with all fields
        print(f"DEBUG: Fetching created client with id: {created_client_id}")
        response = supabase_storage.table("clients").select("*").eq("id", created_client_id).execute()
        
        print(f"DEBUG: Fetch response: {response}")
        print(f"DEBUG: Fetch response data: {response.data}")
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to fetch created client")
        
        # Try to validate the response
        try:
            result = response.data[0]
            print(f"DEBUG: Returning result: {result}")
            # Validate using the Client model
            validated_client = Client(**result)
            return validated_client
        except Exception as validation_error:
            print(f"DEBUG: Validation error: {validation_error}")
            import traceback
            traceback.print_exc()
            # Return the raw data anyway, but log the validation error
            return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_details = str(e)
        print(f"DEBUG: Full error traceback:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create client: {error_details}")

@router.put("/{client_id}", response_model=Client)
async def update_client(client_id: str, client: ClientCreate):
    """Update a client"""
    try:
        # Get existing client to check for Stripe customer ID
        existing_response = supabase_storage.table("clients").select("*").eq("id", client_id).execute()
        if not existing_response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        existing_client = existing_response.data[0]
        # Use model_dump() for Pydantic v2 compatibility, fallback to dict() for v1
        try:
            client_data = client.model_dump(exclude_none=True)
        except AttributeError:
            client_data = client.dict(exclude_none=True)
        
        # Create or update Stripe customer if email is provided
        if client_data.get("email"):
            try:
                stripe_customer_id = StripeService.create_or_get_customer(
                    {**client_data, "id": client_id},
                    existing_client.get("stripe_customer_id"),
                    update_if_exists=True  # Update existing customer with new address/data
                )
                client_data["stripe_customer_id"] = stripe_customer_id
            except Exception as e:
                # Log error but don't fail client update
                print(f"Failed to update Stripe customer: {e}")
        
        # Update the client - Supabase returns updated data by default
        response = supabase_storage.table("clients").update(client_data).eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Fetch the complete updated client to ensure all fields are returned
        updated_response = supabase_storage.table("clients").select("*").eq("id", client_id).execute()
        if not updated_response.data:
            raise HTTPException(status_code=404, detail="Client not found after update")
        return updated_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{client_id}")
async def delete_client(client_id: str):
    """Delete a client"""
    try:
        response = supabase_storage.table("clients").delete().eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        return {"message": "Client deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/profile/me", response_model=Client)
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    """Get the current user's client profile"""
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")
        
        # Find client record for this user
        response = supabase_storage.table("clients").select("*").eq("user_id", user_id).execute()
        if not response.data or len(response.data) == 0:
            # No client record exists, create one
            user_email = current_user.get("email", "")
            user_name = current_user.get("name", "") or user_email.split("@")[0] if user_email else "User"
            
            new_client = {
                "name": user_name,
                "email": user_email,
                "user_id": user_id,
                "registration_source": "self_registered"
            }
            insert_response = supabase_storage.table("clients").insert(new_client).execute()
            if insert_response.data:
                return insert_response.data[0]
            else:
                raise HTTPException(status_code=500, detail="Failed to create client profile")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/profile/me", response_model=Client)
async def update_my_profile(
    client: ClientCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update the current user's client profile"""
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")
        
        # Find client record for this user
        response = supabase_storage.table("clients").select("*").eq("user_id", user_id).execute()
        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Client profile not found")
        
        client_id = response.data[0]["id"]
        existing_client = response.data[0]
        
        # Use model_dump() for Pydantic v2 compatibility, fallback to dict() for v1
        try:
            client_data = client.model_dump(exclude_none=True)
        except AttributeError:
            client_data = client.dict(exclude_none=True)
        
        # Don't allow users to change registration_source or user_id
        client_data.pop("registration_source", None)
        client_data.pop("user_id", None)
        
        # Create or update Stripe customer if email is provided
        if client_data.get("email"):
            try:
                stripe_customer_id = StripeService.create_or_get_customer(
                    {**client_data, "id": client_id},
                    existing_client.get("stripe_customer_id"),
                    update_if_exists=True
                )
                client_data["stripe_customer_id"] = stripe_customer_id
            except Exception as e:
                # Log error but don't fail profile update
                print(f"Failed to update Stripe customer: {e}")
        
        # Update the client
        update_response = supabase_storage.table("clients").update(client_data).eq("id", client_id).execute()
        if not update_response.data:
            raise HTTPException(status_code=404, detail="Client profile not found after update")
        
        # Fetch the complete updated client
        updated_response = supabase_storage.table("clients").select("*").eq("id", client_id).execute()
        if not updated_response.data:
            raise HTTPException(status_code=404, detail="Client profile not found after update")
        return updated_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Profile picture size limit: 5MB
MAX_PROFILE_PICTURE_SIZE = 5 * 1024 * 1024

@router.post("/profile/me/picture", response_model=Client)
async def upload_profile_picture(
    file: UploadFile = FastAPIFile(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a profile picture for the current user"""
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")
        
        # Find client record for this user
        response = supabase_storage.table("clients").select("*").eq("user_id", user_id).execute()
        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Client profile not found")
        
        client_id = response.data[0]["id"]
        existing_client = response.data[0]
        
        # Validate file type (only images)
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Validate file size
        file_content = await file.read()
        if len(file_content) > MAX_PROFILE_PICTURE_SIZE:
            raise HTTPException(status_code=400, detail=f"File size exceeds {MAX_PROFILE_PICTURE_SIZE / (1024*1024)}MB limit")
        
        # Generate unique filename
        file_hash = hashlib.md5(file_content).hexdigest()[:8]
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        file_id = str(uuid.uuid4())
        unique_filename = f"profile-pictures/{user_id}/{file_id}_{file_hash}.{file_extension}"
        
        # Delete old profile picture if it exists
        old_picture_url = existing_client.get("profile_picture_url")
        if old_picture_url:
            try:
                # Extract path from URL if it's a full URL
                old_path = old_picture_url
                if "/storage/v1/object/public/" in old_picture_url:
                    old_path = old_picture_url.split("/storage/v1/object/public/profile-pictures/")[-1]
                elif "profile-pictures/" in old_picture_url:
                    old_path = old_picture_url.split("profile-pictures/")[-1]
                
                if old_path:
                    full_old_path = f"profile-pictures/{old_path}" if not old_path.startswith("profile-pictures/") else old_path
                    supabase_storage.storage.from_("profile-pictures").remove([full_old_path])
            except Exception as e:
                print(f"Warning: Could not delete old profile picture: {e}")
        
        # Upload to Supabase Storage (bucket: profile-pictures)
        try:
            upload_response = supabase_storage.storage.from_("profile-pictures").upload(
                unique_filename,
                file_content,
                file_options={
                    "content-type": file.content_type,
                    "upsert": "false"
                }
            )
            print(f"Profile picture uploaded successfully: {unique_filename}")
        except Exception as storage_error:
            error_msg = str(storage_error)
            print(f"Storage upload error: {error_msg}")
            if "bucket" in error_msg.lower() or "not found" in error_msg.lower():
                raise HTTPException(
                    status_code=500, 
                    detail="Storage bucket 'profile-pictures' not configured. Please create it in Supabase Storage dashboard."
                )
            elif "permission" in error_msg.lower() or "policy" in error_msg.lower():
                raise HTTPException(
                    status_code=500,
                    detail="Storage permissions not configured. Please check Supabase Storage policies for 'profile-pictures' bucket."
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload profile picture to storage: {error_msg}"
                )
        
        # Get public URL
        try:
            public_url = supabase_storage.storage.from_("profile-pictures").get_public_url(unique_filename)
        except Exception as url_error:
            print(f"Warning: Could not get public URL: {str(url_error)}")
            # Fallback: construct URL manually
            public_url = f"{supabase_url}/storage/v1/object/public/profile-pictures/{unique_filename}"
        
        # Update client record with new profile picture URL
        update_response = supabase_storage.table("clients").update({
            "profile_picture_url": public_url
        }).eq("id", client_id).execute()
        
        if not update_response.data:
            # Try to delete uploaded file if database update fails
            try:
                supabase_storage.storage.from_("profile-pictures").remove([unique_filename])
            except:
                pass
            raise HTTPException(status_code=500, detail="Failed to update profile picture URL")
        
        # Fetch the complete updated client
        updated_response = supabase_storage.table("clients").select("*").eq("id", client_id).execute()
        if not updated_response.data:
            raise HTTPException(status_code=404, detail="Client profile not found after update")
        return updated_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

