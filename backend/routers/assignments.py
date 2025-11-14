"""
Assignment endpoints for quotes and forms
Allows admins to assign quotes and forms to customers
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional
from database import supabase, supabase_storage, supabase_url, supabase_service_role_key
from auth import get_current_admin, get_current_user
from email_service import email_service
import uuid
from datetime import datetime
import requests

router = APIRouter(prefix="/api", tags=["assignments"])


class AssignRequest(BaseModel):
    folder_ids: List[str]  # List of folder IDs to assign to
    expires_at: Optional[str] = None  # Optional expiration date (ISO format) - deprecated, kept for backward compatibility


class AssignmentResponse(BaseModel):
    id: str
    quote_id: Optional[str] = None
    form_id: Optional[str] = None
    user_id: str
    assigned_by: str
    assigned_at: str
    status: str
    expires_at: Optional[str] = None
    access_token: Optional[str] = None


# Quote Assignment Endpoints
@router.post("/quotes/{quote_id}/assign")
async def assign_quote(
    quote_id: str,
    assign_request: AssignRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Assign a quote to one or more folders (admin only).
    Users access quotes through folder assignments.
    """
    try:
        # Use service role client to bypass RLS for admin operations
        # Verify quote exists and get quote details
        quote_response = supabase_storage.table("quotes").select("id, title, quote_number").eq("id", quote_id).execute()
        if not quote_response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote = quote_response.data[0]
        quote_title = quote.get("title", "Quote")
        quote_number = quote.get("quote_number", "")
        
        assignments = []
        folders_to_notify = []  # Store folder info for notifications
        
        for folder_id in assign_request.folder_ids:
            # Verify folder exists
            folder_response = supabase_storage.table("folders").select("id, name, client_id").eq("id", folder_id).execute()
            if not folder_response.data:
                print(f"Warning: Folder {folder_id} not found, skipping")
                continue
            
            folder = folder_response.data[0]
            folders_to_notify.append(folder)
            
            # Check if assignment already exists
            existing = supabase_storage.table("quote_folder_assignments").select("id").eq("quote_id", quote_id).eq("folder_id", folder_id).execute()
            
            if existing.data:
                # Update existing assignment
                supabase_storage.table("quote_folder_assignments").update({
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat()
                }).eq("id", existing.data[0]["id"]).execute()
                assignments.append(existing.data[0]["id"])
            else:
                # Create new assignment
                assignment_data = {
                    "id": str(uuid.uuid4()),
                    "quote_id": quote_id,
                    "folder_id": folder_id,
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat()
                }
                result = supabase_storage.table("quote_folder_assignments").insert(assignment_data).execute()
                if result.data:
                    assignments.append(result.data[0]["id"])
            
            # Also set folder_id on quote if not already set (for backward compatibility)
            current_quote = supabase_storage.table("quotes").select("folder_id").eq("id", quote_id).single().execute()
            if current_quote.data and not current_quote.data.get("folder_id"):
                supabase_storage.table("quotes").update({"folder_id": folder_id}).eq("id", quote_id).execute()
        
        # Get users assigned to these folders for email notifications
        users_to_notify = []
        if folders_to_notify and supabase_service_role_key:
            folder_ids = [f["id"] for f in folders_to_notify]
            # Get folder assignments
            folder_assignments_response = supabase_storage.table("folder_assignments").select("folder_id, user_id").in_("folder_id", folder_ids).execute()
            
            if folder_assignments_response.data:
                user_ids = list(set([fa["user_id"] for fa in folder_assignments_response.data]))
                
                # Get user emails
                for user_id in user_ids:
                    try:
                        auth_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
                        headers = {
                            "apikey": supabase_service_role_key,
                            "Authorization": f"Bearer {supabase_service_role_key}",
                            "Content-Type": "application/json"
                        }
                        user_response = requests.get(auth_url, headers=headers, timeout=10)
                        if user_response.status_code == 200:
                            user_data = user_response.json()
                            user_email = user_data.get("email")
                            user_metadata = user_data.get("user_metadata", {})
                            user_name = user_metadata.get("name")
                            if user_email:
                                users_to_notify.append({
                                    "email": user_email,
                                    "name": user_name,
                                    "user_id": user_id
                                })
                    except Exception as e:
                        print(f"Warning: Could not fetch user info for {user_id}: {str(e)}")
        
        # Get admin name for email
        admin_name = None
        try:
            if supabase_service_role_key:
                auth_url = f"{supabase_url}/auth/v1/admin/users/{current_admin['id']}"
                headers = {
                    "apikey": supabase_service_role_key,
                    "Authorization": f"Bearer {supabase_service_role_key}",
                    "Content-Type": "application/json"
                }
                admin_response = requests.get(auth_url, headers=headers, timeout=10)
                if admin_response.status_code == 200:
                    admin_data = admin_response.json()
                    admin_metadata = admin_data.get("user_metadata", {})
                    admin_name = admin_metadata.get("name") or admin_data.get("email", "Admin")
        except Exception as e:
            print(f"Warning: Could not fetch admin name: {str(e)}")
        
        # Send email notifications to users with folder access
        for user_info in users_to_notify:
            try:
                email_service.send_quote_assignment_notification(
                    to_email=user_info["email"],
                    quote_title=quote_title,
                    quote_number=quote_number,
                    quote_id=quote_id,
                    user_name=user_info["name"],
                    assigned_by=admin_name
                )
            except Exception as e:
                # Log but don't fail the assignment
                print(f"Warning: Failed to send email notification to {user_info['email']}: {str(e)}")
        
        return {
            "message": f"Quote assigned to {len(assignments)} folder(s)",
            "assignment_ids": assignments
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign quote: {str(e)}"
        )


@router.get("/quotes/{quote_id}/assignments")
async def get_quote_assignments(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all folder assignments for a quote.
    Admins see all folder assignments, customers see only folders they have access to.
    """
    try:
        # Use service role client for admin to bypass RLS, regular client for customers
        client = supabase_storage if current_user["role"] == "admin" else supabase
        
        # Get folder assignments
        query = supabase_storage.table("quote_folder_assignments").select("*, folders(*)").eq("quote_id", quote_id)
        
        response = query.execute()
        assignments = response.data or []
        
        # If customer, filter to only folders they have access to
        if current_user["role"] != "admin":
            # Get folders assigned to user
            folder_assignments_response = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", current_user["id"]).execute()
            accessible_folder_ids = [fa["folder_id"] for fa in (folder_assignments_response.data or [])]
            
            # Filter assignments to only accessible folders
            assignments = [a for a in assignments if a.get("folder_id") in accessible_folder_ids]
        
        # Enrich with folder info (already included via join, but ensure it's structured)
        for assignment in assignments:
            if assignment.get("folders"):
                assignment["folder"] = assignment["folders"]
                del assignment["folders"]
        
        return assignments
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get assignments: {str(e)}"
        )


@router.delete("/quotes/{quote_id}/assignments/{assignment_id}")
async def unassign_quote(
    quote_id: str,
    assignment_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Remove a quote from a folder (admin only).
    """
    try:
        # Use service role client to bypass RLS for admin operations
        result = supabase_storage.table("quote_folder_assignments").delete().eq("id", assignment_id).eq("quote_id", quote_id).execute()
        
        # Verify the assignment was deleted
        if not result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        return {"message": "Quote removed from folder successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove assignment: {str(e)}"
        )


# Form Assignment Endpoints
@router.post("/forms/{form_id}/assign")
async def assign_form(
    form_id: str,
    assign_request: AssignRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Assign a form to one or more folders (admin only).
    Users access forms through folder assignments.
    """
    try:
        # Use service role client to bypass RLS for admin operations
        # Verify form exists and get form details
        form_response = supabase_storage.table("forms").select("id, name").eq("id", form_id).execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = form_response.data[0]
        form_name = form.get("name", "Form")
        
        assignments = []
        folders_to_notify = []  # Store folder info for notifications
        
        for folder_id in assign_request.folder_ids:
            # Verify folder exists
            folder_response = supabase_storage.table("folders").select("id, name, client_id").eq("id", folder_id).execute()
            if not folder_response.data:
                print(f"Warning: Folder {folder_id} not found, skipping")
                continue
            
            folder = folder_response.data[0]
            folders_to_notify.append(folder)
            
            # Check if assignment already exists (using form_folder_assignments table)
            existing = supabase_storage.table("form_folder_assignments").select("id").eq("form_id", form_id).eq("folder_id", folder_id).execute()
            
            if existing.data:
                # Update existing assignment
                supabase_storage.table("form_folder_assignments").update({
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat()
                }).eq("id", existing.data[0]["id"]).execute()
                assignments.append(existing.data[0]["id"])
            else:
                # Create new assignment
                assignment_data = {
                    "id": str(uuid.uuid4()),
                    "form_id": form_id,
                    "folder_id": folder_id,
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat()
                }
                result = supabase_storage.table("form_folder_assignments").insert(assignment_data).execute()
                if result.data:
                    assignments.append(result.data[0]["id"])
        
        # Get users assigned to these folders for email notifications
        users_to_notify = []
        if folders_to_notify and supabase_service_role_key:
            folder_ids = [f["id"] for f in folders_to_notify]
            # Get folder assignments
            folder_assignments_response = supabase_storage.table("folder_assignments").select("folder_id, user_id").in_("folder_id", folder_ids).execute()
            
            if folder_assignments_response.data:
                user_ids = list(set([fa["user_id"] for fa in folder_assignments_response.data]))
                
                # Get user emails
                for user_id in user_ids:
                    try:
                        auth_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
                        headers = {
                            "apikey": supabase_service_role_key,
                            "Authorization": f"Bearer {supabase_service_role_key}",
                            "Content-Type": "application/json"
                        }
                        user_response = requests.get(auth_url, headers=headers, timeout=10)
                        if user_response.status_code == 200:
                            user_data = user_response.json()
                            user_email = user_data.get("email")
                            user_metadata = user_data.get("user_metadata", {})
                            user_name = user_metadata.get("name")
                            if user_email:
                                users_to_notify.append({
                                    "email": user_email,
                                    "name": user_name,
                                    "user_id": user_id
                                })
                    except Exception as e:
                        print(f"Warning: Could not fetch user info for {user_id}: {str(e)}")
        
        # Get admin name for email
        admin_name = None
        try:
            if supabase_service_role_key:
                auth_url = f"{supabase_url}/auth/v1/admin/users/{current_admin['id']}"
                headers = {
                    "apikey": supabase_service_role_key,
                    "Authorization": f"Bearer {supabase_service_role_key}",
                    "Content-Type": "application/json"
                }
                admin_response = requests.get(auth_url, headers=headers, timeout=10)
                if admin_response.status_code == 200:
                    admin_data = admin_response.json()
                    admin_metadata = admin_data.get("user_metadata", {})
                    admin_name = admin_metadata.get("name") or admin_data.get("email", "Admin")
        except Exception as e:
            print(f"Warning: Could not fetch admin name: {str(e)}")
        
        # Send email notifications to users with folder access
        for user_info in users_to_notify:
            try:
                email_service.send_form_assignment_notification(
                    to_email=user_info["email"],
                    form_name=form_name,
                    form_id=form_id,
                    user_name=user_info["name"],
                    assigned_by=admin_name
                )
            except Exception as e:
                # Log but don't fail the assignment
                print(f"Warning: Failed to send email notification to {user_info['email']}: {str(e)}")
        
        return {
            "message": f"Form assigned to {len(assignments)} folder(s)",
            "assignment_ids": assignments
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign form: {str(e)}"
        )


@router.get("/forms/{form_id}/assignments")
async def get_form_assignments(
    form_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all folder assignments for a form.
    Admins see all folder assignments, customers see only folders they have access to.
    """
    try:
        # Get folder assignments
        query = supabase_storage.table("form_folder_assignments").select("*, folders(*)").eq("form_id", form_id)
        
        response = query.execute()
        assignments = response.data or []
        
        # If customer, filter to only folders they have access to
        if current_user["role"] != "admin":
            # Get folders assigned to user
            folder_assignments_response = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", current_user["id"]).execute()
            accessible_folder_ids = [fa["folder_id"] for fa in (folder_assignments_response.data or [])]
            
            # Filter assignments to only accessible folders
            assignments = [a for a in assignments if a.get("folder_id") in accessible_folder_ids]
        
        # Enrich with folder info (already included via join, but ensure it's structured)
        for assignment in assignments:
            if assignment.get("folders"):
                assignment["folder"] = assignment["folders"]
                del assignment["folders"]
        
        return assignments
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get assignments: {str(e)}"
        )


@router.delete("/forms/{form_id}/assignments/{assignment_id}")
async def unassign_form(
    form_id: str,
    assignment_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Remove a form from a folder (admin only).
    """
    try:
        # Use service role client to bypass RLS for admin operations
        result = supabase_storage.table("form_folder_assignments").delete().eq("id", assignment_id).eq("form_id", form_id).execute()
        
        # Verify the assignment was deleted
        if not result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        return {"message": "Form removed from folder successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove assignment: {str(e)}"
        )


# Customer endpoints to get their assigned items
@router.get("/customer/quotes")
async def get_customer_quotes(current_user: dict = Depends(get_current_user)):
    """
    Get all quotes assigned to folders the current customer has access to.
    """
    try:
        # Get folders assigned to user
        folder_assignments_response = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", current_user["id"]).execute()
        accessible_folder_ids = [fa["folder_id"] for fa in (folder_assignments_response.data or [])]
        
        if not accessible_folder_ids:
            return []
        
        # Get quotes assigned to these folders
        quote_assignments_response = supabase_storage.table("quote_folder_assignments").select("quote_id").in_("folder_id", accessible_folder_ids).execute()
        quote_ids = [qa["quote_id"] for qa in (quote_assignments_response.data or [])]
        
        # Also get quotes with folder_id directly set (for backward compatibility)
        quotes_with_folder = supabase_storage.table("quotes").select("id").in_("folder_id", accessible_folder_ids).execute()
        direct_quote_ids = [q["id"] for q in (quotes_with_folder.data or [])]
        
        # Combine and deduplicate
        all_quote_ids = list(set(quote_ids + direct_quote_ids))
        
        if not all_quote_ids:
            return []
        
        # Get the quotes - use service role client to bypass RLS
        quotes_response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").in_("id", all_quote_ids).order("created_at", desc=True).execute()
        return quotes_response.data or []
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get customer quotes: {str(e)}"
        )


@router.get("/customer/forms")
async def get_customer_forms(current_user: dict = Depends(get_current_user)):
    """
    Get all forms assigned to the current customer.
    """
    try:
        # Use service role client to bypass RLS and ensure customers can see their assignments
        # Get all form assignments for this user
        assignments_response = supabase_storage.table("form_assignments").select("form_id").eq("user_id", current_user["id"]).execute()
        form_ids = [a["form_id"] for a in (assignments_response.data or [])]
        
        if not form_ids:
            return []
        
        # Get the forms - use service role client to bypass RLS
        forms_response = supabase_storage.table("forms").select("*, form_fields(*)").in_("id", form_ids).order("created_at", desc=True).execute()
        
        # Sort fields by order_index
        forms = forms_response.data or []
        for form in forms:
            fields = form.get("form_fields", [])
            if fields:
                fields = sorted(fields, key=lambda x: x.get("order_index", 0))
            form["fields"] = fields
            if "form_fields" in form:
                del form["form_fields"]
        
        return forms
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get customer forms: {str(e)}"
        )

