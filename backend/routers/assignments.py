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
    user_ids: List[str]  # List of user IDs to assign to
    expires_at: Optional[str] = None  # Optional expiration date (ISO format)


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
    Assign a quote to one or more customers (admin only).
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
        
        assignments = []
        users_to_notify = []  # Store user info for email notifications
        
        for user_id in assign_request.user_ids:
            # Handle client_ prefixed IDs (clients without user accounts)
            actual_user_id = user_id
            is_client_without_user = user_id.startswith("client_")
            
            if is_client_without_user:
                # Extract client_id from prefixed ID
                client_id = user_id.replace("client_", "")
                # Get client email
                client_response = supabase_storage.table("clients").select("email, name").eq("id", client_id).execute()
                if client_response.data:
                    client = client_response.data[0]
                    client_email = client.get("email")
                    client_name = client.get("name")
                    if client_email:
                        users_to_notify.append({
                            "email": client_email,
                            "name": client_name,
                            "user_id": None  # No user account
                        })
                # Skip assignment creation for clients without user accounts
                # They can't access quotes without accounts
                continue
            
            # Check if assignment already exists
            existing = supabase_storage.table("quote_assignments").select("id").eq("quote_id", quote_id).eq("user_id", actual_user_id).execute()
            
            if existing.data:
                # Update existing assignment
                supabase_storage.table("quote_assignments").update({
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat(),
                    "expires_at": assign_request.expires_at,
                    "status": "assigned"
                }).eq("id", existing.data[0]["id"]).execute()
                assignments.append(existing.data[0]["id"])
            else:
                # Create new assignment
                assignment_data = {
                    "id": str(uuid.uuid4()),
                    "quote_id": quote_id,
                    "user_id": actual_user_id,
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat(),
                    "expires_at": assign_request.expires_at,
                    "status": "assigned",
                    "created_at": datetime.now().isoformat()
                }
                result = supabase_storage.table("quote_assignments").insert(assignment_data).execute()
                if result.data:
                    assignments.append(result.data[0]["id"])
            
            # Get user email and name for notification
            try:
                if supabase_service_role_key:
                    auth_url = f"{supabase_url}/auth/v1/admin/users/{actual_user_id}"
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
                                "user_id": actual_user_id
                            })
            except Exception as e:
                print(f"Warning: Could not fetch user info for {actual_user_id}: {str(e)}")
        
        # Send email notifications
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
            "message": f"Quote assigned to {len(assignments)} user(s)",
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
    Get all assignments for a quote.
    Admins see all assignments, customers see only their own.
    """
    try:
        # Use service role client for admin to bypass RLS, regular client for customers
        client = supabase_storage if current_user["role"] == "admin" else supabase
        
        # Get assignments without join (join syntax was causing 400 errors)
        query = client.table("quote_assignments").select("*").eq("quote_id", quote_id)
        
        # If customer, only show their own assignments
        if current_user["role"] != "admin":
            query = query.eq("user_id", current_user["id"])
        
        response = query.execute()
        assignments = response.data or []
        
        # Enrich assignments with user email and name
        if assignments and supabase_service_role_key:
            # Get all unique user IDs
            user_ids = list(set([a.get("user_id") for a in assignments if a.get("user_id")]))
            
            if user_ids:
                # Fetch all users from Supabase Auth using REST API
                auth_url = f"{supabase_url}/auth/v1/admin/users"
                headers = {
                    "apikey": supabase_service_role_key,
                    "Authorization": f"Bearer {supabase_service_role_key}",
                    "Content-Type": "application/json"
                }
                
                user_map = {}
                try:
                    # Get all users (with pagination if needed)
                    response = requests.get(auth_url, headers=headers, params={"per_page": 1000}, timeout=10)
                    if response.status_code == 200:
                        users_data = response.json()
                        for auth_user in users_data.get("users", []):
                            user_id = auth_user.get("id")
                            if user_id in user_ids:
                                user_email = auth_user.get("email")
                                user_metadata = auth_user.get("user_metadata", {})
                                user_name = user_metadata.get("name")
                                user_map[user_id] = {
                                    "email": user_email,
                                    "name": user_name
                                }
                except Exception as e:
                    print(f"Warning: Could not fetch users for assignments: {e}")
                
                # Enrich assignments with user info
                for assignment in assignments:
                    user_id = assignment.get("user_id")
                    if user_id in user_map:
                        assignment["user"] = user_map[user_id]
        
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
    Remove a quote assignment (admin only).
    """
    try:
        # Use service role client to bypass RLS for admin operations (consistent with assign endpoint)
        result = supabase_storage.table("quote_assignments").delete().eq("id", assignment_id).eq("quote_id", quote_id).execute()
        
        # Verify the assignment was deleted
        if not result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        return {"message": "Assignment removed successfully"}
        
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
    Assign a form to one or more customers (admin only).
    """
    try:
        # Use service role client to bypass RLS for admin operations
        # Verify form exists and get form details
        form_response = supabase_storage.table("forms").select("id, name").eq("id", form_id).execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = form_response.data[0]
        form_name = form.get("name", "Form")
        
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
        
        assignments = []
        users_to_notify = []  # Store user info for email notifications
        
        for user_id in assign_request.user_ids:
            # Handle client_ prefixed IDs (clients without user accounts)
            actual_user_id = user_id
            is_client_without_user = user_id.startswith("client_")
            
            if is_client_without_user:
                # Extract client_id from prefixed ID
                client_id = user_id.replace("client_", "")
                # Get client email
                client_response = supabase_storage.table("clients").select("email, name").eq("id", client_id).execute()
                if client_response.data:
                    client = client_response.data[0]
                    client_email = client.get("email")
                    client_name = client.get("name")
                    if client_email:
                        users_to_notify.append({
                            "email": client_email,
                            "name": client_name,
                            "user_id": None  # No user account
                        })
                # Skip assignment creation for clients without user accounts
                # They can't access forms without accounts
                continue
            
            # Check if assignment already exists
            existing = supabase_storage.table("form_assignments").select("id").eq("form_id", form_id).eq("user_id", actual_user_id).execute()
            
            if existing.data:
                # Update existing assignment
                supabase_storage.table("form_assignments").update({
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat(),
                    "expires_at": assign_request.expires_at,
                    "status": "pending"
                }).eq("id", existing.data[0]["id"]).execute()
                assignments.append(existing.data[0]["id"])
            else:
                # Create new assignment with unique access token
                assignment_data = {
                    "id": str(uuid.uuid4()),
                    "form_id": form_id,
                    "user_id": actual_user_id,
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat(),
                    "expires_at": assign_request.expires_at,
                    "status": "pending",
                    "access_token": str(uuid.uuid4()),
                    "created_at": datetime.now().isoformat()
                }
                result = supabase_storage.table("form_assignments").insert(assignment_data).execute()
                if result.data:
                    assignments.append(result.data[0]["id"])
            
            # Get user email and name for notification
            try:
                if supabase_service_role_key:
                    auth_url = f"{supabase_url}/auth/v1/admin/users/{actual_user_id}"
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
                                "user_id": actual_user_id
                            })
            except Exception as e:
                print(f"Warning: Could not fetch user info for {actual_user_id}: {str(e)}")
        
        # Send email notifications
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
            "message": f"Form assigned to {len(assignments)} user(s)",
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
    Get all assignments for a form.
    Admins see all assignments, customers see only their own.
    """
    try:
        # Use service role client for admin to bypass RLS, regular client for customers
        client = supabase_storage if current_user["role"] == "admin" else supabase
        
        # Get assignments without join (join syntax was causing 400 errors)
        query = client.table("form_assignments").select("*").eq("form_id", form_id)
        
        # If customer, only show their own assignments
        if current_user["role"] != "admin":
            query = query.eq("user_id", current_user["id"])
        
        response = query.execute()
        assignments = response.data or []
        
        # Enrich assignments with user email and name
        if assignments and supabase_service_role_key:
            # Get all unique user IDs
            user_ids = list(set([a.get("user_id") for a in assignments if a.get("user_id")]))
            
            if user_ids:
                # Fetch all users from Supabase Auth using REST API
                auth_url = f"{supabase_url}/auth/v1/admin/users"
                headers = {
                    "apikey": supabase_service_role_key,
                    "Authorization": f"Bearer {supabase_service_role_key}",
                    "Content-Type": "application/json"
                }
                
                user_map = {}
                try:
                    # Get all users (with pagination if needed)
                    response = requests.get(auth_url, headers=headers, params={"per_page": 1000}, timeout=10)
                    if response.status_code == 200:
                        users_data = response.json()
                        for auth_user in users_data.get("users", []):
                            user_id = auth_user.get("id")
                            if user_id in user_ids:
                                user_email = auth_user.get("email")
                                user_metadata = auth_user.get("user_metadata", {})
                                user_name = user_metadata.get("name")
                                user_map[user_id] = {
                                    "email": user_email,
                                    "name": user_name
                                }
                except Exception as e:
                    print(f"Warning: Could not fetch users for assignments: {e}")
                
                # Enrich assignments with user info
                for assignment in assignments:
                    user_id = assignment.get("user_id")
                    if user_id in user_map:
                        assignment["user"] = user_map[user_id]
        
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
    Remove a form assignment (admin only).
    """
    try:
        # Use service role client to bypass RLS for admin operations (consistent with assign endpoint)
        result = supabase_storage.table("form_assignments").delete().eq("id", assignment_id).eq("form_id", form_id).execute()
        
        # Verify the assignment was deleted
        if not result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        return {"message": "Assignment removed successfully"}
        
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
    Get all quotes assigned to the current customer.
    """
    try:
        # Use service role client to bypass RLS and ensure customers can see their assignments
        # Get all quote assignments for this user
        assignments_response = supabase_storage.table("quote_assignments").select("quote_id").eq("user_id", current_user["id"]).execute()
        quote_ids = [a["quote_id"] for a in (assignments_response.data or [])]
        
        if not quote_ids:
            return []
        
        # Get the quotes - use service role client to bypass RLS
        quotes_response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").in_("id", quote_ids).order("created_at", desc=True).execute()
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

