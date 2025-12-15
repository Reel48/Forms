from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
import uuid
import logging
from pydantic import BaseModel
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import (
    Folder, FolderCreate, FolderUpdate,
    FolderAssignment, FolderAssignmentCreate,
    FormFolderAssignment, FormFolderAssignmentCreate
)
from database import supabase, supabase_storage
from auth import get_current_user, get_current_admin
from folder_tasks import build_customer_tasks, compute_stage_and_next_step

router = APIRouter(prefix="/api/folders", tags=["folders"])

logger = logging.getLogger(__name__)

# Customer-facing order stages (folder = order)
ORDER_STAGES = {
    "quote_sent",
    "quote_accepted_or_paid",
    "design_info_needed",
    "production",
    "shipped",
    "delivered",
    "closed",
}


def _safe_now_iso() -> str:
    return datetime.now().isoformat()


def _compute_shipping_summary(folder_id: str) -> Dict[str, Any]:
    """Compute shipping summary from shipments + latest tracking event."""
    try:
        shipments = (
            supabase_storage
            .table("shipments")
            .select("*")
            .eq("folder_id", folder_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        shipment = shipments[0] if shipments else None
    except Exception:
        shipment = None

    latest_event = None
    if shipment and shipment.get("id"):
        try:
            ev = (
                supabase_storage
                .table("shipment_tracking_events")
                .select("*")
                .eq("shipment_id", shipment.get("id"))
                .order("timestamp", desc=True)
                .limit(1)
                .execute()
            )
            if ev.data:
                latest_event = ev.data[0]
        except Exception:
            latest_event = None

    if not shipment:
        return {"has_shipment": False}

    status = shipment.get("status") or (latest_event or {}).get("status")
    return {
        "has_shipment": True,
        "status": status,
        "carrier_name": shipment.get("carrier_name") or shipment.get("carrier"),
        "tracking_number": shipment.get("tracking_number"),
        "estimated_delivery_date": shipment.get("estimated_delivery_date"),
        "actual_delivery_date": shipment.get("actual_delivery_date"),
        "latest_event": latest_event,
    }


def _compute_progress(files: List[Dict[str, Any]], forms: List[Dict[str, Any]], esignatures: List[Dict[str, Any]]) -> Dict[str, Any]:
    forms_total = len(forms or [])
    esigs_total = len(esignatures or [])
    forms_completed = len([f for f in (forms or []) if f.get("is_completed")])
    esigs_completed = len([e for e in (esignatures or []) if e.get("is_completed")])
    files_total = len(files or [])
    files_viewed = len([f for f in (files or []) if f.get("is_completed")])
    return {
        # NOTE: tasks_total/tasks_completed are now derived from summary.tasks
        # so the progress bar and task list always match.
        "forms_total": forms_total,
        "forms_completed": forms_completed,
        "esignatures_total": esigs_total,
        "esignatures_completed": esigs_completed,
        "files_total": files_total,
        "files_viewed": files_viewed,
    }


def _emit_folder_event(folder_id: str, event_type: str, title: str, details: Optional[Dict[str, Any]] = None, created_by: Optional[str] = None) -> None:
    """Best-effort folder event insert (non-fatal)."""
    try:
        supabase_storage.table("folder_events").insert({
            "id": str(uuid.uuid4()),
            "folder_id": folder_id,
            "event_type": event_type,
            "title": title,
            "details": details or {},
            "created_by": created_by,
            "created_at": _safe_now_iso(),
        }).execute()
    except Exception:
        # Table may not exist yet or insert may fail; do not break request flows.
        return


def _get_folder_client_email(folder_id: str) -> Optional[str]:
    try:
        folder = supabase_storage.table("folders").select("client_id").eq("id", folder_id).single().execute().data
        client_id = (folder or {}).get("client_id")
        if not client_id:
            return None
        client = supabase_storage.table("clients").select("email").eq("id", client_id).single().execute().data
        email = (client or {}).get("email")
        return email.lower().strip() if isinstance(email, str) and email.strip() else None
    except Exception:
        return None


def _assert_folder_access(folder_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch folder and assert current user can access it."""
    is_admin = user.get("role") == "admin"
    folder_resp = supabase_storage.table("folders").select("id, created_by").eq("id", folder_id).single().execute()
    if not folder_resp.data:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder = folder_resp.data

    if not is_admin:
        try:
            assignment = (
                supabase_storage
                .table("folder_assignments")
                .select("folder_id")
                .eq("folder_id", folder_id)
                .eq("user_id", user["id"])
                .execute()
            )
            if not assignment.data and folder.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        except HTTPException:
            raise
        except Exception:
            if folder.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")

    return folder


class FolderNoteCreate(BaseModel):
    title: str
    body: str

@router.get("", response_model=List[Folder])
async def list_folders(
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    quote_id: Optional[str] = Query(None, description="Filter by quote ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    user = Depends(get_current_user)
):
    """List folders. Admins see all folders, users see folders assigned to them."""
    try:
        from database import supabase_storage
        
        # Check if user is admin - use the role from the user dict (already checked in get_current_user)
        is_admin = user.get("role") == "admin"
        
        # Use service role client for all authenticated users to bypass RLS
        # We'll filter by assignments for non-admins
        query = supabase_storage.table("folders").select("*")
        
        # Apply filters
        if client_id:
            query = query.eq("client_id", client_id)
        if quote_id:
            query = query.eq("quote_id", quote_id)
        if status:
            query = query.eq("status", status)
        
        # If not admin, filter by folder assignments
        if not is_admin:
            # Get folders assigned to user - use service role client to bypass RLS
            try:
                folder_assignments = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).execute()
                accessible_folder_ids = [fa["folder_id"] for fa in folder_assignments.data] if folder_assignments.data else []
                
                if accessible_folder_ids:
                    # Filter by accessible folder IDs AND verify folders still exist
                    # This ensures deleted folders don't appear even if assignments weren't cascade deleted
                    query = query.in_("id", accessible_folder_ids)
                else:
                    # User has no assigned folders, return empty list
                    return []
            except Exception as e:
                print(f"Error checking folder assignments: {str(e)}")
                # If folder_assignments table doesn't exist yet, return empty
                return []
        
        response = query.order("created_at", desc=True).execute()
        folders = response.data if response.data else []
        
        # Additional safety check: Filter out any folders that don't have active assignments
        # This catches edge cases where folder exists but assignment was deleted
        if not is_admin and folders:
            try:
                # Get current assignments again to verify
                current_assignments = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).execute()
                valid_folder_ids = {fa["folder_id"] for fa in (current_assignments.data or [])}
                # Filter to only include folders with valid assignments
                folders = [f for f in folders if f["id"] in valid_folder_ids]
            except Exception as e:
                print(f"Error verifying folder assignments: {str(e)}")
                # If verification fails, return empty to be safe
                return []
        
        return folders
    except Exception as e:
        print(f"Error listing folders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list folders: {str(e)}")

@router.get("/{folder_id}", response_model=Folder)
async def get_folder(folder_id: str, user = Depends(get_current_user)):
    """Get folder by ID."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Use service role client to bypass RLS for all authenticated users
        response = supabase_storage.table("folders").select("*").eq("id", folder_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        folder = response.data
        
        # Check access if not admin
        if not is_admin:
            # Check if folder is assigned to user - use service role client to bypass RLS
            try:
                assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                if not assignment.data:
                    # Check if user created it
                    if folder.get("created_by") != user["id"]:
                        raise HTTPException(status_code=403, detail="Access denied")
            except Exception:
                # If folder_assignments doesn't exist, check creator
                if folder.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
        
        return folder
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get folder: {str(e)}")

def _auto_assign_purchase_agreement(folder_id: str, assigned_by: str):
    """Helper function to auto-assign 'Reel48 Purchase Agreement' e-signature template to a folder"""
    try:
        import uuid
        from datetime import datetime
        import logging
        logger = logging.getLogger(__name__)
        
        # Find the "Reel48 Purchase Agreement" template by name
        template_response = supabase_storage.table("esignature_documents").select("*").eq("name", "Reel48 Purchase Agreement").eq("is_template", True).single().execute()
        
        if not template_response.data:
            logger.warning("Reel48 Purchase Agreement e-signature template not found")
            return
        
        template_doc = template_response.data
        template_id = template_doc["id"]
        template_name = template_doc.get("name", "Reel48 Purchase Agreement")
        
        # Get folder name
        folder_response = supabase_storage.table("folders").select("name").eq("id", folder_id).single().execute()
        folder_name = folder_response.data.get("name", "Folder") if folder_response.data else "Folder"
        
        # Generate the copy name: "Folder Name - E-Signature Name"
        copy_name = f"{folder_name} - {template_name}"
        
        # Check if a copy already exists for this template in this folder
        existing_copy = supabase_storage.table("esignature_documents").select("id").eq("folder_id", folder_id).eq("is_template", False).eq("name", copy_name).execute()
        if existing_copy.data:
            # Copy already exists, skip
            return
        
        # Create a copy of the template document for this folder
        copy_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        copy_data = {
            "id": copy_id,
            "name": copy_name,
            "description": template_doc.get("description"),
            "file_id": template_doc.get("file_id"),
            "document_type": template_doc.get("document_type", "agreement"),
            "signature_mode": template_doc.get("signature_mode", "simple"),
            "require_signature": template_doc.get("require_signature", True),
            "signature_fields": template_doc.get("signature_fields"),
            "is_template": False,
            "folder_id": folder_id,
            "quote_id": template_doc.get("quote_id"),
            "expires_at": template_doc.get("expires_at"),
            "created_by": assigned_by,
            "status": "pending",
            "created_at": now,
            "updated_at": now
        }
        
        # Create the copy
        copy_response = supabase_storage.table("esignature_documents").insert(copy_data).execute()
        
        # Also create an assignment record linking the template to the folder
        assignment_data = {
            "document_id": template_id,
            "folder_id": folder_id,
            "assigned_by": assigned_by,
            "status": "pending"
        }
        
        try:
            supabase_storage.table("esignature_document_folder_assignments").insert(assignment_data).execute()
        except Exception as e:
            logger.warning(f"Could not create assignment record: {str(e)}")
        
        logger.info(f"Auto-assigned Reel48 Purchase Agreement to folder {folder_id}")
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error auto-assigning Purchase Agreement: {str(e)}", exc_info=True)
        # Don't raise - this is a non-critical operation

@router.post("", response_model=Folder)
async def create_folder(
    folder: FolderCreate,
    user = Depends(get_current_user)
):
    """Create a new folder. Admins can create folders for any client."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Only admins can create folders
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can create folders")
        
        # Create folder
        folder_data = folder.model_dump(exclude_none=True, exclude={"assign_to_user_id"})
        folder_data["created_by"] = user["id"]
        
        response = supabase_storage.table("folders").insert(folder_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create folder")
        
        created_folder = response.data[0]
        folder_id = created_folder["id"]
        
        # If assign_to_user_id is provided, create assignment
        if folder.assign_to_user_id:
            try:
                assignment_data = {
                    "folder_id": folder_id,
                    "user_id": folder.assign_to_user_id,
                    "role": "viewer",
                    "assigned_by": user["id"]
                }
                supabase_storage.table("folder_assignments").insert(assignment_data).execute()
            except Exception as assign_error:
                print(f"Warning: Could not create folder assignment: {str(assign_error)}")
        
        # If quote_id is provided, update quote to link to folder
        if folder.quote_id:
            try:
                supabase_storage.table("quotes").update({"folder_id": folder_id}).eq("id", folder.quote_id).execute()
            except Exception as quote_error:
                print(f"Warning: Could not update quote: {str(quote_error)}")
        
        # Auto-assign "Reel48 Purchase Agreement" e-signature template to the folder
        try:
            import logging
            logger = logging.getLogger(__name__)
            _auto_assign_purchase_agreement(folder_id, user["id"])
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not auto-assign Purchase Agreement e-signature: {str(e)}")
        
        return created_folder
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {str(e)}")

@router.put("/{folder_id}", response_model=Folder)
async def update_folder(
    folder_id: str,
    folder_update: FolderUpdate,
    user = Depends(get_current_user)
):
    """Update a folder."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Get existing folder
        existing = supabase_storage.table("folders").select("*").eq("id", folder_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Check access
        if not is_admin and existing.data.get("created_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Update folder
        update_data = folder_update.model_dump(exclude_none=True)
        response = supabase_storage.table("folders").update(update_data).eq("id", folder_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update folder")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update folder: {str(e)}")

@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, user = Depends(get_current_user)):
    """Delete a folder."""
    try:
        from database import supabase_storage
        import logging
        logger = logging.getLogger(__name__)
        
        # Check if user is admin - use the role from the user dict
        is_admin = user.get("role") == "admin"
        
        # Use service role client for admins to bypass RLS, regular client for users
        client = supabase_storage if is_admin else supabase
        
        # Get existing folder
        try:
            existing = client.table("folders").select("*").eq("id", folder_id).single().execute()
            if not existing.data:
                raise HTTPException(status_code=404, detail="Folder not found")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error fetching folder for deletion: {str(e)}")
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Check access (for non-admins)
        if not is_admin and existing.data.get("created_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete folder and related assignments
        # Use service role client to ensure deletion works even with RLS
        try:
            # First, explicitly delete folder_assignments to ensure they're removed
            # (CASCADE should handle this, but being explicit ensures it works)
            try:
                supabase_storage.table("folder_assignments").delete().eq("folder_id", folder_id).execute()
                logger.info(f"Deleted folder_assignments for folder {folder_id}")
            except Exception as e:
                logger.warning(f"Could not delete folder_assignments (may already be deleted): {str(e)}")
            
            # Delete the folder itself (this will cascade delete other related records)
            # Always use service role client for deletion to bypass RLS
            supabase_storage.table("folders").delete().eq("id", folder_id).execute()
            logger.info(f"Folder {folder_id} deleted successfully by user {user['id']}")
            
            # Verify deletion
            verify = supabase_storage.table("folders").select("id").eq("id", folder_id).execute()
            if verify.data:
                logger.error(f"Folder {folder_id} still exists after deletion attempt!")
                raise HTTPException(status_code=500, detail="Folder deletion failed - folder still exists")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting folder: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to delete folder: {str(e)}")
        
        return {"message": "Folder deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Error deleting folder: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete folder: {str(e)}")

@router.post("/{folder_id}/assign", response_model=FolderAssignment)
async def assign_folder_to_user(
    folder_id: str,
    assignment: FolderAssignmentCreate,
    user = Depends(get_current_user)
):
    """Assign a folder to a user."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Only admins can assign folders
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can assign folders")
        
        # Verify folder exists - use service role client to bypass RLS
        folder_response = supabase_storage.table("folders").select("id").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Create assignment - use service role client to bypass RLS
        assignment_data = assignment.model_dump(exclude_none=True)
        assignment_data["folder_id"] = folder_id
        assignment_data["assigned_by"] = user["id"]
        
        response = supabase_storage.table("folder_assignments").insert(assignment_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create assignment")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to assign folder: {str(e)}")

@router.delete("/{folder_id}/assign/{user_id}")
async def remove_folder_assignment(
    folder_id: str,
    user_id: str,
    user = Depends(get_current_user)
):
    """Remove folder assignment from a user."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Only admins can remove assignments
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can remove folder assignments")
        
        # Delete assignment - use service role client to bypass RLS
        supabase_storage.table("folder_assignments").delete().eq("folder_id", folder_id).eq("user_id", user_id).execute()
        
        return {"message": "Assignment removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing assignment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to remove assignment: {str(e)}")

@router.get("/{folder_id}/assignments", response_model=List[FolderAssignment])
async def get_folder_assignments(folder_id: str, user = Depends(get_current_user)):
    """Get all assignments for a folder."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Check folder access - use service role client to bypass RLS
        folder_response = supabase_storage.table("folders").select("*").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        if not is_admin:
            # Check if user has access to folder - use service role client to bypass RLS
            try:
                assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
            except Exception:
                if folder_response.data.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
        
        # Get assignments - use service role client to bypass RLS
        response = supabase_storage.table("folder_assignments").select("*").eq("folder_id", folder_id).execute()
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting assignments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get assignments: {str(e)}")

@router.post("/{folder_id}/forms/{form_id}", response_model=FormFolderAssignment)
async def assign_form_to_folder(
    folder_id: str,
    form_id: str,
    user = Depends(get_current_user)
):
    """Assign a form to a folder."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Verify folder and form exist - use service role client to bypass RLS
        folder_response = supabase_storage.table("folders").select("id").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        form_response = supabase_storage.table("forms").select("id, created_by").eq("id", form_id).single().execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Check permissions: admins can assign any form to any folder, users can only assign their own forms to folders they have access to
        if not is_admin:
            if form_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="You can only assign forms you created")
            
            # Check if user has access to the folder
            folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
            if not folder_assignment.data:
                raise HTTPException(status_code=403, detail="You don't have access to this folder")
        # Admins can assign any form to any folder - no additional checks needed
        
        # Check if assignment already exists
        existing_assignment = supabase_storage.table("form_folder_assignments").select("id").eq("form_id", form_id).eq("folder_id", folder_id).execute()
        if existing_assignment.data:
            # Already assigned, return the existing assignment
            return existing_assignment.data[0]
        
        # Create assignment
        assignment_data = {
            "form_id": form_id,
            "folder_id": folder_id,
            "assigned_by": user["id"]
        }
        
        try:
            # Use service role client to bypass RLS
            response = supabase_storage.table("form_folder_assignments").insert(assignment_data).execute()
            
            if not response.data:
                raise HTTPException(status_code=500, detail="Failed to create assignment")

            # Best-effort event for timeline
            try:
                form_name = None
                try:
                    f = supabase_storage.table("forms").select("name").eq("id", form_id).single().execute()
                    form_name = (f.data or {}).get("name")
                except Exception:
                    form_name = None
                _emit_folder_event(
                    folder_id=folder_id,
                    event_type="form_assigned",
                    title=f"Form assigned{': ' + form_name if form_name else ''}",
                    details={"form_id": form_id, "form_name": form_name},
                    created_by=user.get("id"),
                )
            except Exception:
                pass

            return response.data[0]
        except Exception as e:
            error_msg = str(e)
            if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
                # Assignment was created by another request, fetch and return it
                existing = supabase_storage.table("form_folder_assignments").select("*").eq("form_id", form_id).eq("folder_id", folder_id).single().execute()
                if existing.data:
                    return existing.data[0]
            raise HTTPException(status_code=500, detail=f"Failed to assign form: {error_msg}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning form to folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to assign form: {str(e)}")

@router.delete("/{folder_id}/forms/{form_id}")
async def remove_form_from_folder(
    folder_id: str,
    form_id: str,
    user = Depends(get_current_user)
):
    """Remove a form from a folder."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Only admins can remove form assignments
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can remove form assignments")
        
        # Check if assignment exists first
        assignment_check = supabase_storage.table("form_folder_assignments").select("id").eq("folder_id", folder_id).eq("form_id", form_id).execute()
        if not assignment_check.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        # Verify form still exists before deleting assignment
        form_check = supabase_storage.table("forms").select("id, name, is_template").eq("id", form_id).single().execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found - cannot remove assignment")
        print(f"Removing form assignment: form_id={form_id}, form_name={form_check.data.get('name')}, is_template={form_check.data.get('is_template')}")
        
        # Delete assignment - use service role client to bypass RLS
        # Get the assignment ID first, then delete by ID (more reliable)
        assignment_id = assignment_check.data[0]["id"]
        delete_response = supabase_storage.table("form_folder_assignments").delete().eq("id", assignment_id).execute()
        
        # Verify deletion - check if assignment still exists
        verify_check = supabase_storage.table("form_folder_assignments").select("id").eq("folder_id", folder_id).eq("form_id", form_id).execute()
        if verify_check.data:
            print(f"Error: Assignment still exists after delete attempt for folder {folder_id}, form {form_id}")
            raise HTTPException(status_code=500, detail="Failed to remove assignment - assignment still exists")
        
        # Verify form still exists after deleting assignment (should always be true)
        form_after_check = supabase_storage.table("forms").select("id, name, is_template").eq("id", form_id).single().execute()
        if not form_after_check.data:
            print(f"ERROR: Form {form_id} was deleted when assignment was removed! This should not happen.")
            raise HTTPException(status_code=500, detail="Form was deleted when assignment was removed - this is a bug")
        print(f"Form still exists after assignment removal: form_id={form_id}, is_template={form_after_check.data.get('is_template')}")
        
        return {"message": "Form assignment removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing form assignment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to remove form assignment: {str(e)}")

@router.post("/{folder_id}/files/{file_id}")
async def assign_file_to_folder(
    folder_id: str,
    file_id: str,
    user = Depends(get_current_user)
):
    """Assign a file to a folder."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Verify folder and file exist - use service role client to bypass RLS
        folder_response = supabase_storage.table("folders").select("id").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        file_response = supabase_storage.table("files").select("id, uploaded_by").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check permissions: admins can assign any file to any folder, users can only assign their own files to folders they have access to
        if not is_admin:
            if file_response.data.get("uploaded_by") != user["id"]:
                raise HTTPException(status_code=403, detail="You can only assign files you uploaded")
            
            # Check if user has access to the folder
            folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
            if not folder_assignment.data:
                raise HTTPException(status_code=403, detail="You don't have access to this folder")
        # Admins can assign any file to any folder - no additional checks needed
        
        # Check if assignment already exists
        existing_assignment = supabase_storage.table("file_folder_assignments").select("id").eq("file_id", file_id).eq("folder_id", folder_id).execute()
        if existing_assignment.data:
            # Already assigned, return the existing assignment
            return existing_assignment.data[0]
        
        # Create assignment (use existing file_folder_assignments table)
        assignment_data = {
            "file_id": file_id,
            "folder_id": folder_id,
            "assigned_by": user["id"]
        }
        
        try:
            # Use service role client to bypass RLS
            response = supabase_storage.table("file_folder_assignments").insert(assignment_data).execute()
            if not response.data:
                raise HTTPException(status_code=500, detail="Failed to create assignment")

            # Best-effort event for timeline
            try:
                file_name = None
                try:
                    f = supabase_storage.table("files").select("name").eq("id", file_id).single().execute()
                    file_name = (f.data or {}).get("name")
                except Exception:
                    file_name = None
                _emit_folder_event(
                    folder_id=folder_id,
                    event_type="file_assigned",
                    title=f"File added{': ' + file_name if file_name else ''}",
                    details={"file_id": file_id, "file_name": file_name},
                    created_by=user.get("id"),
                )
            except Exception:
                pass

            return response.data[0]
        except Exception as e:
            error_msg = str(e)
            if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
                # Assignment was created by another request, fetch and return it
                existing = supabase_storage.table("file_folder_assignments").select("*").eq("file_id", file_id).eq("folder_id", folder_id).single().execute()
                if existing.data:
                    return existing.data[0]
            raise HTTPException(status_code=500, detail=f"Failed to assign file: {error_msg}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning file to folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to assign file: {str(e)}")

@router.delete("/{folder_id}/files/{file_id}")
async def remove_file_from_folder(
    folder_id: str,
    file_id: str,
    user = Depends(get_current_user)
):
    """Remove a file from a folder."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Only admins can remove file assignments
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can remove file assignments")
        
        # Check if assignment exists first
        assignment_check = supabase_storage.table("file_folder_assignments").select("id").eq("folder_id", folder_id).eq("file_id", file_id).execute()
        if not assignment_check.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        # Verify file still exists before deleting assignment
        file_check = supabase_storage.table("files").select("id, name, is_reusable").eq("id", file_id).single().execute()
        if not file_check.data:
            raise HTTPException(status_code=404, detail="File not found - cannot remove assignment")
        print(f"Removing file assignment: file_id={file_id}, file_name={file_check.data.get('name')}, is_reusable={file_check.data.get('is_reusable')}")
        
        # Delete assignment - use service role client to bypass RLS
        # Get the assignment ID first, then delete by ID (more reliable)
        assignment_id = assignment_check.data[0]["id"]
        delete_response = supabase_storage.table("file_folder_assignments").delete().eq("id", assignment_id).execute()
        
        # Verify deletion - check if assignment still exists
        verify_check = supabase_storage.table("file_folder_assignments").select("id").eq("folder_id", folder_id).eq("file_id", file_id).execute()
        if verify_check.data:
            print(f"Error: Assignment still exists after delete attempt for folder {folder_id}, file {file_id}")
            raise HTTPException(status_code=500, detail="Failed to remove assignment - assignment still exists")
        
        # Verify file still exists after deleting assignment (should always be true)
        file_after_check = supabase_storage.table("files").select("id, name, is_reusable").eq("id", file_id).single().execute()
        if not file_after_check.data:
            print(f"ERROR: File {file_id} was deleted when assignment was removed! This should not happen.")
            raise HTTPException(status_code=500, detail="File was deleted when assignment was removed - this is a bug")
        print(f"File still exists after assignment removal: file_id={file_id}, is_reusable={file_after_check.data.get('is_reusable')}")
        
        return {"message": "File assignment removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing file assignment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to remove file assignment: {str(e)}")

@router.post("/{folder_id}/esignature/{document_id}")
async def assign_esignature_to_folder(
    folder_id: str,
    document_id: str,
    user = Depends(get_current_user)
):
    """Assign an e-signature document to a folder by creating a copy.
    The template remains unchanged, and the copy in the folder can be signed independently."""
    try:
        import uuid
        from datetime import datetime
        
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
            print(f"Admin check for user {user['id']}: is_admin={is_admin}")
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Verify folder and document exist - use service role client to bypass RLS
        folder_response = supabase_storage.table("folders").select("id, name").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        folder = folder_response.data
        folder_name = folder.get("name", "Folder")
        
        # Get the full template document
        template_doc_response = supabase_storage.table("esignature_documents").select("*").eq("id", document_id).single().execute()
        if not template_doc_response.data:
            raise HTTPException(status_code=404, detail="E-signature document not found")
        
        template_doc = template_doc_response.data
        template_name = template_doc.get("name", "E-Signature Document")
        
        # Only allow assigning templates (is_template = True) to folders
        if not template_doc.get("is_template", False):
            raise HTTPException(status_code=400, detail="Only template documents can be assigned to folders. Templates will be copied for use in the folder.")
        
        print(f"Assigning template document {document_id} to folder {folder_id}, is_admin={is_admin}")
        
        # Check permissions: admins can assign any document to any folder, users can only assign their own documents to folders they have access to
        if not is_admin:
            if template_doc.get("created_by") != user["id"]:
                print(f"User {user['id']} does not own document {document_id}")
                raise HTTPException(status_code=403, detail="You can only assign e-signature documents you created")
            
            # Check if user has access to the folder
            folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
            if not folder_assignment.data:
                print(f"User {user['id']} does not have access to folder {folder_id}")
                raise HTTPException(status_code=403, detail="You don't have access to this folder")
        else:
            print(f"Admin user {user['id']} can assign document to folder - skipping permission checks")
        
        # Generate the copy name: "Folder Name - E-Signature Name"
        copy_name = f"{folder_name} - {template_name}"
        
        # Check if a copy already exists for this template in this folder
        # We check by folder_id and the expected copy name
        existing_copy = supabase_storage.table("esignature_documents").select("id").eq("folder_id", folder_id).eq("is_template", False).eq("name", copy_name).execute()
        if existing_copy.data:
            # Copy already exists, return it instead of creating a new one
            existing_doc = supabase_storage.table("esignature_documents").select("*").eq("id", existing_copy.data[0]["id"]).single().execute()
            if existing_doc.data:
                return existing_doc.data[0]
        
        # Create a copy of the template document for this folder
        # The copy will be an instance (is_template = False) and can be signed without affecting the template
        copy_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        copy_data = {
            "id": copy_id,
            "name": copy_name,  # Use "Folder Name - E-Signature Name" format
            "description": template_doc.get("description"),
            "file_id": template_doc.get("file_id"),  # Same file reference
            "document_type": template_doc.get("document_type", "terms_of_service"),
            "signature_mode": template_doc.get("signature_mode", "simple"),
            "require_signature": template_doc.get("require_signature", True),
            "signature_fields": template_doc.get("signature_fields"),
            "is_template": False,  # This is an instance, not a template
            "folder_id": folder_id,  # Directly assigned to folder
            "quote_id": template_doc.get("quote_id"),  # Preserve quote_id if exists
            "expires_at": template_doc.get("expires_at"),
            "created_by": user["id"],  # The user assigning it
            "status": "pending",  # Start as pending
            "created_at": now,
            "updated_at": now
        }
        
        # Create the copy
        copy_response = supabase_storage.table("esignature_documents").insert(copy_data).execute()
        
        if not copy_response.data:
            raise HTTPException(status_code=500, detail="Failed to create document copy")
        
        copy_doc = copy_response.data[0]
        
        # Also create an assignment record linking the template to the folder (for reference)
        # This allows us to track which template was used
        assignment_data = {
            "document_id": document_id,  # Original template ID
            "folder_id": folder_id,
            "assigned_by": user["id"],
            "status": "pending"
        }
        
        try:
            # Use service role client to bypass RLS
            assignment_response = supabase_storage.table("esignature_document_folder_assignments").insert(assignment_data).execute()
        except Exception as e:
            # If assignment fails, that's okay - the copy was created successfully
            print(f"Warning: Could not create assignment record: {str(e)}")

        # Best-effort event for timeline
        try:
            _emit_folder_event(
                folder_id=folder_id,
                event_type="esignature_assigned",
                title="E-signature document assigned",
                details={"template_document_id": document_id, "document_id": copy_doc.get("id"), "name": copy_doc.get("name")},
                created_by=user.get("id"),
            )
        except Exception:
            pass

        # Email notification (best-effort): customer needs to sign
        try:
            import os as _os
            if _os.getenv("ENABLE_FOLDER_EVENT_EMAILS", "false").lower() == "true":
                from email_service import email_service, FRONTEND_URL
                to_email = _get_folder_client_email(folder_id)
                if to_email:
                    folder_link = f"{FRONTEND_URL}/folders/{folder_id}"
                    subject = "Signature required for your order"
                    html = f"""
                    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                      <h2>Signature required</h2>
                      <p>Please sign the required document in your order folder:</p>
                      <p><b>{copy_doc.get('name') or 'E-signature document'}</b></p>
                      <p><a href="{folder_link}">Open your order folder</a></p>
                    </div>
                    """
                    text = f"Signature required\n\nPlease sign: {copy_doc.get('name') or 'E-signature document'}\nOpen your order folder: {folder_link}"
                    email_service._send_email(to_email, subject, html, text)
        except Exception:
            pass

        return copy_doc
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning e-signature to folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to assign e-signature: {str(e)}")

@router.delete("/{folder_id}/esignature/{document_id}")
async def remove_esignature_from_folder(
    folder_id: str,
    document_id: str,
    user = Depends(get_current_user)
):
    """Remove an e-signature document instance from a folder.
    This deletes the copy (instance) that was created when the template was assigned to the folder."""
    try:
        # Check if user is admin - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception as e:
            print(f"Error checking admin status: {str(e)}")
            is_admin = False
        
        # Only admins can remove e-signature instances
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can remove e-signature documents from folders")
        
        # Check if this is an instance (copy) in the folder
        doc_check = supabase_storage.table("esignature_documents").select("id, name, is_template, folder_id").eq("id", document_id).single().execute()
        if not doc_check.data:
            raise HTTPException(status_code=404, detail="E-signature document not found")
        
        doc = doc_check.data
        
        # Only allow deleting instances (copies), not templates
        if doc.get("is_template", False):
            raise HTTPException(status_code=400, detail="Cannot delete template documents. Only instances (copies) in folders can be removed.")
        
        # Verify the document is in this folder
        if doc.get("folder_id") != folder_id:
            raise HTTPException(status_code=400, detail="Document is not in this folder")
        
        print(f"Removing e-signature instance: document_id={document_id}, document_name={doc.get('name')}, folder_id={folder_id}")
        
        # Delete the instance (copy) - this is safe because it's a copy, not the template
        delete_response = supabase_storage.table("esignature_documents").delete().eq("id", document_id).execute()
        
        # Also try to remove any assignment records (for reference)
        try:
            supabase_storage.table("esignature_document_folder_assignments").delete().eq("folder_id", folder_id).eq("document_id", document_id).execute()
        except Exception:
            # Assignment removal is optional - the instance deletion is what matters
            pass
        
        return {"message": "E-signature document removed from folder successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing e-signature from folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to remove e-signature from folder: {str(e)}")

@router.get("/{folder_id}/content")
async def get_folder_content(folder_id: str, user = Depends(get_current_user)):
    """Get all content in a folder (quotes, files, forms, e-signatures)."""
    try:
        from database import supabase_storage
        import logging
        logger = logging.getLogger(__name__)
        
        # Check if user is admin - use the role from the user dict
        is_admin = user.get("role") == "admin"
        
        # Use service role client for all authenticated users to bypass RLS
        # We'll filter by folder assignments for non-admins to ensure proper access control
        client = supabase_storage
        
        # Check folder access - use service role client to bypass RLS
        try:
            folder_response = client.table("folders").select("*").eq("id", folder_id).single().execute()
            if not folder_response.data:
                raise HTTPException(status_code=404, detail="Folder not found")
        except Exception as e:
            logger.error(f"Error fetching folder: {str(e)}")
            raise HTTPException(status_code=404, detail="Folder not found")
        
        if not is_admin:
            # Check if user has access to folder - use service role client to bypass RLS
            try:
                assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
            except HTTPException:
                raise
            except Exception:
                if folder_response.data.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
        
        folder = folder_response.data
        
        # Get quote
        quote = None
        if folder.get("quote_id"):
            try:
                quote_response = client.table("quotes").select("*, clients(*), line_items(*)").eq("id", folder["quote_id"]).single().execute()
                quote = quote_response.data if quote_response.data else None
            except Exception as e:
                logger.warning(f"Error fetching quote: {str(e)}")
                pass
        
        # Get folder-specific files only (not reusable templates)
        # Files uploaded directly to this folder with is_reusable=False
        files = []
        try:
            # Get only folder-specific files (directly assigned, not reusable)
            files_response = supabase_storage.table("files").select("*").eq("folder_id", folder_id).eq("is_reusable", False).execute()
            files = files_response.data if files_response.data else []
            
            # Check completion status for each file
            # For admins: check if ANY user has viewed it
            # For customers: check if the current user has viewed it
            for file in files:
                file["item_type"] = "file"
                try:
                    if is_admin:
                        # Admin: check if any user has viewed this file
                        view_check = supabase_storage.table("file_views").select("id").eq("file_id", file["id"]).limit(1).execute()
                        file["is_completed"] = len(view_check.data or []) > 0
                    else:
                        # Customer: check if current user has viewed this file
                        view_check = supabase_storage.table("file_views").select("id").eq("file_id", file["id"]).eq("user_id", user["id"]).limit(1).execute()
                        file["is_completed"] = len(view_check.data or []) > 0
                except Exception:
                    file["is_completed"] = False
        except Exception as e:
            logger.warning(f"Error fetching files: {str(e)}")
            pass
        
        # Get forms assigned to folder
        # Include both: templates (via many-to-many) and instances (via direct assignment)
        forms = []
        try:
            # Get templates assigned via many-to-many relationship
            form_assignments = supabase_storage.table("form_folder_assignments").select("form_id").eq("folder_id", folder_id).execute()
            template_form_ids = [fa["form_id"] for fa in (form_assignments.data or [])]
            
            # Get templates
            if template_form_ids:
                templates_response = supabase_storage.table("forms").select("*, form_fields(*)").in_("id", template_form_ids).eq("is_template", True).execute()
                templates = templates_response.data if templates_response.data else []
            else:
                templates = []
            
            # Check completion status and submission count for each form
            # For admins: check if ANY user has submitted it and count all submissions
            # For customers: check if the current user has submitted it and count their submissions
            # Note: Forms use submitter_email instead of user_id, so we'll check by email
            for form in templates:
                form["item_type"] = "form"
                try:
                    if is_admin:
                        # Admin: check if any user has submitted this form and count all submissions
                        submission_check = supabase_storage.table("form_submissions").select("id").eq("form_id", form["id"]).limit(1).execute()
                        form["is_completed"] = len(submission_check.data or []) > 0
                        # Count all completed submissions for admin
                        count_response = supabase_storage.table("form_submissions").select("id", count="exact").eq("form_id", form["id"]).eq("status", "completed").execute()
                        form["submissions_count"] = count_response.count if hasattr(count_response, 'count') else len(count_response.data or [])
                    else:
                        # Customer: check if current user has submitted this form and count their submissions
                        user_email = user.get("email")
                        if user_email:
                            # Normalize email to lowercase for comparison (emails are case-insensitive)
                            user_email_lower = user_email.lower().strip()
                            logger.info(f"Checking form completion for user email: {user_email_lower} (form_id: {form['id']})")
                            try:
                                # Query submissions for this form and user email (case-insensitive)
                                # Get all submissions and filter in Python to ensure case-insensitive matching
                                all_submissions = supabase_storage.table("form_submissions").select("id, submitter_email, status").eq("form_id", form["id"]).execute()
                                logger.info(f"Found {len(all_submissions.data or [])} total submissions for form {form['id']}")
                                
                                # Filter submissions by case-insensitive email match
                                matching_submissions = []
                                for s in (all_submissions.data or []):
                                    submission_email = s.get("submitter_email", "")
                                    if submission_email:
                                        submission_email_lower = submission_email.lower().strip()
                                        if submission_email_lower == user_email_lower:
                                            matching_submissions.append(s)
                                
                                logger.info(f"Found {len(matching_submissions)} matching submissions for email {user_email_lower}")
                                
                                form["is_completed"] = len(matching_submissions) > 0
                                # Count only completed submissions
                                completed_submissions = [s for s in matching_submissions if s.get("status") == "completed"]
                                form["submissions_count"] = len(completed_submissions)
                                logger.info(f"Form {form['id']} - is_completed: {form['is_completed']}, submissions_count: {form['submissions_count']}")
                            except Exception as e:
                                logger.error(f"Error checking form completion for user {user_email}: {str(e)}")
                                import traceback
                                logger.error(traceback.format_exc())
                                form["is_completed"] = False
                                form["submissions_count"] = 0
                        else:
                            logger.warning(f"No email found for user {user.get('id')} when checking form completion")
                            form["is_completed"] = False
                            form["submissions_count"] = 0
                except Exception:
                    form["is_completed"] = False
                    form["submissions_count"] = 0
            forms = templates
        except Exception as e:
            logger.warning(f"Error fetching forms: {str(e)}")
            pass
        
        # Get e-signature documents assigned to folder
        # Show only instances (copies) that were created when templates were assigned to the folder
        # Templates remain in the template library and are not shown in folder content
        esignatures = []
        try:
            # Get instances (copies) directly assigned to folder
            # These are copies created when templates were assigned, with is_template=False
            instances_response = supabase_storage.table("esignature_documents").select("*").eq("folder_id", folder_id).eq("is_template", False).execute()
            instances = instances_response.data if instances_response.data else []
            
            # Check completion status for each e-signature
            # For admins: check if ANY user has signed it
            # For customers: check if the current user has signed it
            for esig in instances:
                esig["item_type"] = "esignature"
                try:
                    if is_admin:
                        # Admin: check if any user has signed this document and get signed_file_id
                        signature_check = supabase_storage.table("esignature_signatures").select("id, signed_file_id, signed_file_url").eq("document_id", esig["id"]).limit(1).execute()
                        esig["is_completed"] = len(signature_check.data or []) > 0
                        if signature_check.data and len(signature_check.data) > 0:
                            esig["signed_file_id"] = signature_check.data[0].get("signed_file_id")
                            esig["signed_file_url"] = signature_check.data[0].get("signed_file_url")
                    else:
                        # Customer: check if current user has signed this document and get signed_file_id
                        signature_check = supabase_storage.table("esignature_signatures").select("id, signed_file_id, signed_file_url").eq("document_id", esig["id"]).eq("user_id", user["id"]).limit(1).execute()
                        esig["is_completed"] = len(signature_check.data or []) > 0
                        if signature_check.data and len(signature_check.data) > 0:
                            esig["signed_file_id"] = signature_check.data[0].get("signed_file_id")
                            esig["signed_file_url"] = signature_check.data[0].get("signed_file_url")
                except Exception:
                    esig["is_completed"] = False
            esignatures = instances
        except Exception as e:
            logger.warning(f"Error fetching e-signatures: {str(e)}")
            pass
        
        # Compute customer-friendly status summary
        progress = _compute_progress(files, forms, esignatures)
        shipping_summary = _compute_shipping_summary(folder_id)
        tasks = build_customer_tasks(
            folder_id=folder_id,
            quote=quote,
            forms=forms,
            esignatures=esignatures,
            files_total=int(progress.get("files_total") or 0),
            files_viewed=int(progress.get("files_viewed") or 0),
        )
        stage_info = compute_stage_and_next_step(
            folder=folder,
            quote=quote,
            shipping=shipping_summary,
            tasks=tasks,
        )
        tasks_progress = (stage_info.get("tasks_progress") or {})
        # Ensure progress reflects the tasks list (single source of truth for progress bar)
        progress["tasks_total"] = tasks_progress.get("tasks_total", 0)
        progress["tasks_completed"] = tasks_progress.get("tasks_completed", 0)

        return {
            "folder": folder,
            "quote": quote,
            "files": files,
            "forms": forms,
            "esignatures": esignatures,
            "summary": {
                "stage": stage_info.get("stage"),
                "next_step": stage_info.get("next_step"),
                "next_step_owner": stage_info.get("next_step_owner"),
                "computed_stage": stage_info.get("computed_stage"),
                "computed_next_step": stage_info.get("computed_next_step"),
                "computed_next_step_owner": stage_info.get("computed_next_step_owner"),
                "progress": progress,
                "tasks": tasks,
                "shipping": shipping_summary,
                "updated_at": folder.get("updated_at"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Error getting folder content: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to get folder content: {str(e)}")


@router.get("/{folder_id}/events")
async def get_folder_events(
    folder_id: str,
    limit: int = Query(50, ge=1, le=200, description="Number of events to return"),
    user = Depends(get_current_user),
):
    """Get activity timeline for a folder (order)."""
    try:
        is_admin = user.get("role") == "admin"

        folder_resp = supabase_storage.table("folders").select("id, created_by").eq("id", folder_id).single().execute()
        if not folder_resp.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        folder = folder_resp.data

        if not is_admin:
            try:
                assignment = (
                    supabase_storage
                    .table("folder_assignments")
                    .select("folder_id")
                    .eq("folder_id", folder_id)
                    .eq("user_id", user["id"])
                    .execute()
                )
                if not assignment.data and folder.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
            except HTTPException:
                raise
            except Exception:
                if folder.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")

        events = (
            supabase_storage
            .table("folder_events")
            .select("*")
            .eq("folder_id", folder_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []

        return {"events": events}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folder events: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get folder events: {str(e)}")


@router.post("/{folder_id}/notes")
async def create_folder_note(folder_id: str, payload: FolderNoteCreate, admin_user = Depends(get_current_admin)):
    """Create an admin-authored note/update for a folder."""
    try:
        # Ensure folder exists
        folder_resp = supabase_storage.table("folders").select("id").eq("id", folder_id).single().execute()
        if not folder_resp.data:
            raise HTTPException(status_code=404, detail="Folder not found")

        title = (payload.title or "").strip()
        body = (payload.body or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Note title is required")
        if not body:
            raise HTTPException(status_code=400, detail="Note body is required")

        note_id = str(uuid.uuid4())
        now = _safe_now_iso()
        insert = {
            "id": note_id,
            "folder_id": folder_id,
            "title": title,
            "body": body,
            "created_by": admin_user.get("id"),
            "created_at": now,
        }
        supabase_storage.table("folder_notes").insert(insert).execute()

        # Optional: emit folder event for activity feed
        try:
            _emit_folder_event(
                folder_id=folder_id,
                event_type="note_added",
                title=f"Note added: {title}",
                details={"note_id": note_id, "note_title": title},
                created_by=admin_user.get("id"),
            )
        except Exception:
            pass

        return {"id": note_id, "folder_id": folder_id, "title": title, "body": body, "created_by": admin_user.get("id"), "created_at": now}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating folder note: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create note: {str(e)}")


@router.get("/{folder_id}/notes")
async def list_folder_notes(
    folder_id: str,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user = Depends(get_current_user),
):
    """List folder notes (newest-first). Includes is_read for the current user."""
    try:
        _assert_folder_access(folder_id, user)

        notes = (
            supabase_storage
            .table("folder_notes")
            .select("*")
            .eq("folder_id", folder_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        ).data or []

        note_ids = [n.get("id") for n in notes if n.get("id")]
        reads_by_note: set[str] = set()
        if note_ids:
            try:
                reads = (
                    supabase_storage
                    .table("folder_note_reads")
                    .select("note_id")
                    .eq("user_id", user["id"])
                    .in_("note_id", note_ids)
                    .execute()
                ).data or []
                reads_by_note = {r.get("note_id") for r in reads if r.get("note_id")}
            except Exception:
                reads_by_note = set()

        for n in notes:
            nid = n.get("id")
            n["is_read"] = bool(nid and nid in reads_by_note)

        return {"notes": notes}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing folder notes: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list notes: {str(e)}")


@router.post("/{folder_id}/notes/{note_id}/read")
async def mark_folder_note_read(folder_id: str, note_id: str, user = Depends(get_current_user)):
    """Mark a note as read for the current user (idempotent)."""
    try:
        _assert_folder_access(folder_id, user)

        note = supabase_storage.table("folder_notes").select("id, folder_id").eq("id", note_id).single().execute().data
        if not note or note.get("folder_id") != folder_id:
            raise HTTPException(status_code=404, detail="Note not found")

        try:
            supabase_storage.table("folder_note_reads").insert({
                "note_id": note_id,
                "user_id": user["id"],
                "read_at": _safe_now_iso(),
            }).execute()
        except Exception:
            # Duplicate (already read) is fine
            pass

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking note read: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to mark read: {str(e)}")
