"""
Assignment endpoints for quotes and forms
Allows admins to assign quotes and forms to customers
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional
from database import supabase
from auth import get_current_admin, get_current_user
import uuid
from datetime import datetime

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
        # Verify quote exists
        quote_response = supabase.table("quotes").select("id").eq("id", quote_id).execute()
        if not quote_response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        assignments = []
        for user_id in assign_request.user_ids:
            # Check if assignment already exists
            existing = supabase.table("quote_assignments").select("id").eq("quote_id", quote_id).eq("user_id", user_id).execute()
            
            if existing.data:
                # Update existing assignment
                supabase.table("quote_assignments").update({
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
                    "user_id": user_id,
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat(),
                    "expires_at": assign_request.expires_at,
                    "status": "assigned",
                    "created_at": datetime.now().isoformat()
                }
                result = supabase.table("quote_assignments").insert(assignment_data).execute()
                if result.data:
                    assignments.append(result.data[0]["id"])
        
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
        # Get assignments without join (join syntax was causing 400 errors)
        query = supabase.table("quote_assignments").select("*").eq("quote_id", quote_id)
        
        # If customer, only show their own assignments
        if current_user["role"] != "admin":
            query = query.eq("user_id", current_user["id"])
        
        response = query.execute()
        assignments = response.data or []
        
        # Optionally enrich with user email if needed (fetch separately)
        # For now, just return assignments as-is
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
        supabase.table("quote_assignments").delete().eq("id", assignment_id).eq("quote_id", quote_id).execute()
        return {"message": "Assignment removed successfully"}
        
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
        # Verify form exists
        form_response = supabase.table("forms").select("id").eq("id", form_id).execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        assignments = []
        for user_id in assign_request.user_ids:
            # Check if assignment already exists
            existing = supabase.table("form_assignments").select("id").eq("form_id", form_id).eq("user_id", user_id).execute()
            
            if existing.data:
                # Update existing assignment
                supabase.table("form_assignments").update({
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
                    "user_id": user_id,
                    "assigned_by": current_admin["id"],
                    "assigned_at": datetime.now().isoformat(),
                    "expires_at": assign_request.expires_at,
                    "status": "pending",
                    "access_token": str(uuid.uuid4()),
                    "created_at": datetime.now().isoformat()
                }
                result = supabase.table("form_assignments").insert(assignment_data).execute()
                if result.data:
                    assignments.append(result.data[0]["id"])
        
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
        # Get assignments without join (join syntax was causing 400 errors)
        query = supabase.table("form_assignments").select("*").eq("form_id", form_id)
        
        # If customer, only show their own assignments
        if current_user["role"] != "admin":
            query = query.eq("user_id", current_user["id"])
        
        response = query.execute()
        assignments = response.data or []
        
        # Optionally enrich with user email if needed (fetch separately)
        # For now, just return assignments as-is
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
        supabase.table("form_assignments").delete().eq("id", assignment_id).eq("form_id", form_id).execute()
        return {"message": "Assignment removed successfully"}
        
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
        # Get all quote assignments for this user
        assignments_response = supabase.table("quote_assignments").select("quote_id").eq("user_id", current_user["id"]).execute()
        quote_ids = [a["quote_id"] for a in (assignments_response.data or [])]
        
        if not quote_ids:
            return []
        
        # Get the quotes
        quotes_response = supabase.table("quotes").select("*, clients(*), line_items(*)").in_("id", quote_ids).order("created_at", desc=True).execute()
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
        # Get all form assignments for this user
        assignments_response = supabase.table("form_assignments").select("form_id").eq("user_id", current_user["id"]).execute()
        form_ids = [a["form_id"] for a in (assignments_response.data or [])]
        
        if not form_ids:
            return []
        
        # Get the forms
        forms_response = supabase.table("forms").select("*, form_fields(*)").in_("id", form_ids).order("created_at", desc=True).execute()
        
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

