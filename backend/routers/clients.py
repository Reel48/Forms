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
from auth import get_current_user, get_current_admin
from audit_logger import log_audit_event
import requests
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clients", tags=["clients"])


def _normalize_phone_e164(phone: str) -> str:
    """
    Normalize common phone inputs into E.164.

    Accepts:
    - +15551234567 (already E.164)
    - 5551234567 (assumes US -> +1)
    - 1 (555) 123-4567 (assumes US -> +1)
    """
    raw = (phone or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Phone number is required")

    if raw.startswith("+"):
        digits = raw[1:]
        if not digits.isdigit() or len(digits) < 8 or len(digits) > 15 or digits[0] == "0":
            raise HTTPException(status_code=400, detail="Invalid phone number format")
        return f"+{digits}"

    # Strip all non-digits
    digits_only = "".join(ch for ch in raw if ch.isdigit())
    if len(digits_only) == 10:
        # Assume US 10-digit -> +1XXXXXXXXXX
        return f"+1{digits_only}"
    if len(digits_only) == 11 and digits_only.startswith("1"):
        # Assume US leading 1 -> +1XXXXXXXXXX
        return f"+{digits_only}"

    raise HTTPException(
        status_code=400,
        detail="Phone number must be E.164 (e.g. +15551234567) or a 10-digit US number (e.g. 5551234567)",
    )


class SmsStartRequest(BaseModel):
    phone_e164: str


class SmsConfirmRequest(BaseModel):
    phone_e164: str
    code: str


class NotificationPreferencesUpdate(BaseModel):
    preferred_notification_channel: str  # email | sms

@router.get("", response_model=List[Client])
async def get_clients(current_admin: dict = Depends(get_current_admin)):
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
                    logger.warning("Failed to update registration_source for client %s: %s", client.get("id"), str(e))
        
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
                        logger.warning("Failed to update registration_source for client %s: %s", client.get("id"), str(e))
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
                logger.warning("Failed to fetch/create client for user %s: %s", user_id, str(e))
                continue
        
        return all_clients
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{client_id}", response_model=Client)
async def get_client(client_id: str, current_admin: dict = Depends(get_current_admin)):
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
async def create_client(client: ClientCreate, current_admin: dict = Depends(get_current_admin)):
    """Create a new client"""
    try:
        # Use model_dump() for Pydantic v2 compatibility, fallback to dict() for v1
        try:
            client_data = client.model_dump(exclude_none=True)
        except AttributeError:
            client_data = client.dict(exclude_none=True)
        # Avoid logging PII-heavy payloads in production logs
        
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
                logger.warning("Failed to create Stripe customer: %s", e)
        
        # Insert into Supabase (let it generate id and created_at)
        insert_response = supabase_storage.table("clients").insert(client_data).execute()
        
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to create client: No data returned")
        
        # Get the created client ID
        created_client_id = insert_response.data[0]["id"]
        
        # Fetch the complete client record with all fields
        response = supabase_storage.table("clients").select("*").eq("id", created_client_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to fetch created client")
        
        # Try to validate the response
        try:
            result = response.data[0]
            # Validate using the Client model
            validated_client = Client(**result)
            log_audit_event(
                actor_user_id=current_admin.get("id"),
                action="client_created",
                entity_type="client",
                entity_id=str(validated_client.id),
                target_user_id=validated_client.user_id,
                details={"registration_source": validated_client.registration_source},
            )
            return validated_client
        except Exception as validation_error:
            logger.warning("Failed to validate created client response", exc_info=True)
            # Return the raw data anyway, but log the validation error
            try:
                log_audit_event(
                    actor_user_id=current_admin.get("id"),
                    action="client_created",
                    entity_type="client",
                    entity_id=str(response.data[0].get("id")),
                    target_user_id=response.data[0].get("user_id"),
                )
            except Exception:
                pass
            return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create client: {str(e)}")

@router.put("/{client_id}", response_model=Client)
async def update_client(client_id: str, client: ClientCreate, current_admin: dict = Depends(get_current_admin)):
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
                logger.warning("Failed to update Stripe customer: %s", e)
        
        # Update the client - Supabase returns updated data by default
        response = supabase_storage.table("clients").update(client_data).eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Fetch the complete updated client to ensure all fields are returned
        updated_response = supabase_storage.table("clients").select("*").eq("id", client_id).execute()
        if not updated_response.data:
            raise HTTPException(status_code=404, detail="Client not found after update")

        try:
            log_audit_event(
                actor_user_id=current_admin.get("id"),
                action="client_updated",
                entity_type="client",
                entity_id=str(client_id),
                target_user_id=updated_response.data[0].get("user_id"),
            )
        except Exception:
            pass
        return updated_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{client_id}")
async def delete_client(client_id: str, current_admin: dict = Depends(get_current_admin)):
    """Delete a client"""
    try:
        # Fetch for audit context before delete
        try:
            existing = supabase_storage.table("clients").select("id,user_id").eq("id", client_id).execute()
            existing_user_id = existing.data[0].get("user_id") if existing.data else None
        except Exception:
            existing_user_id = None

        response = supabase_storage.table("clients").delete().eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")

        try:
            log_audit_event(
                actor_user_id=current_admin.get("id"),
                action="client_deleted",
                entity_type="client",
                entity_id=str(client_id),
                target_user_id=existing_user_id,
            )
        except Exception:
            pass
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
                logger.warning("Failed to update Stripe customer: %s", e)
        
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


@router.post("/profile/me/sms/start")
async def start_sms_opt_in(payload: SmsStartRequest, current_user: dict = Depends(get_current_user)):
    """Start Twilio Verify OTP flow for SMS opt-in."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    # Find client record for this user
    resp = supabase_storage.table("clients").select("id, phone_e164, phone").eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Client profile not found")

    row = resp.data[0]
    client_id = row["id"]

    # If frontend didn't pass a phone, fall back to the profile's stored phone.
    candidate = (payload.phone_e164 or "").strip() or (row.get("phone_e164") or "").strip() or (row.get("phone") or "").strip()
    phone_e164 = _normalize_phone_e164(candidate)

    from sms_service import start_verify

    try:
        start_verify(to=phone_e164, channel="sms")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to send verification code")

    # Save phone on profile (best-effort)
    try:
        supabase_storage.table("clients").update({"phone_e164": phone_e164}).eq("id", client_id).execute()
    except Exception:
        pass

    return {"message": "Verification code sent"}


@router.post("/profile/me/sms/confirm")
async def confirm_sms_opt_in(payload: SmsConfirmRequest, current_user: dict = Depends(get_current_user)):
    """Confirm OTP and mark SMS as verified + opted-in."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    code = (payload.code or "").strip()
    if len(code) < 4 or len(code) > 10:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Find client record for this user
    resp = supabase_storage.table("clients").select("id, phone_e164, phone").eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Client profile not found")

    row = resp.data[0]
    client_id = row["id"]

    candidate = (payload.phone_e164 or "").strip() or (row.get("phone_e164") or "").strip() or (row.get("phone") or "").strip()
    phone_e164 = _normalize_phone_e164(candidate)

    from sms_service import check_verify

    approved = False
    try:
        approved = check_verify(to=phone_e164, code=code)
    except Exception:
        approved = False

    if not approved:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    now = __import__("datetime").datetime.now().isoformat()
    supabase_storage.table("clients").update(
        {
            "phone_e164": phone_e164,
            "sms_verified": True,
            "sms_verified_at": now,
            "sms_opt_in": True,
            "sms_opt_in_at": now,
            "sms_opt_out_at": None,
        }
    ).eq("id", client_id).execute()

    return {"message": "Phone verified. SMS notifications enabled."}


@router.put("/profile/me/notification-preferences")
async def update_notification_preferences(
    payload: NotificationPreferencesUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Set preferred notification channel (email or sms)."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    channel = (payload.preferred_notification_channel or "").strip().lower()
    if channel not in ("email", "sms"):
        raise HTTPException(status_code=400, detail="preferred_notification_channel must be 'email' or 'sms'")

    resp = (
        supabase_storage
        .table("clients")
        .select("id, sms_opt_in, sms_verified, phone_e164")
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Client profile not found")

    client = resp.data[0]
    if channel == "sms":
        if not client.get("phone_e164") or not client.get("sms_opt_in") or not client.get("sms_verified"):
            raise HTTPException(status_code=400, detail="Verify your phone and enable SMS before selecting SMS notifications")

    supabase_storage.table("clients").update({"preferred_notification_channel": channel}).eq("id", client["id"]).execute()
    return {"message": "Notification preferences updated"}


@router.post("/profile/me/sms/opt-out")
async def sms_opt_out(current_user: dict = Depends(get_current_user)):
    """Disable SMS notifications and switch preference back to email."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    resp = supabase_storage.table("clients").select("id").eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Client profile not found")

    now = __import__("datetime").datetime.now().isoformat()
    supabase_storage.table("clients").update(
        {
            "sms_opt_in": False,
            "sms_opt_out_at": now,
            "preferred_notification_channel": "email",
        }
    ).eq("id", resp.data[0]["id"]).execute()

    return {"message": "SMS notifications disabled"}

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
                logger.warning("Could not delete old profile picture: %s", e)
        
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
        except Exception as storage_error:
            error_msg = str(storage_error)
            logger.error("Storage upload error: %s", error_msg)
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
            logger.warning("Could not get public URL: %s", str(url_error))
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
