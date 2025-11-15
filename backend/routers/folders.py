from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
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

router = APIRouter(prefix="/api/folders", tags=["folders"])

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
        
        # Use service role client for admins to bypass RLS, regular client for users
        if is_admin:
            query = supabase_storage.table("folders").select("*")
        else:
            query = supabase.table("folders").select("*")
        
        # Apply filters
        if client_id:
            query = query.eq("client_id", client_id)
        if quote_id:
            query = query.eq("quote_id", quote_id)
        if status:
            query = query.eq("status", status)
        
        # If not admin, filter by folder assignments
        if not is_admin:
            # Get folders assigned to user
            try:
                folder_assignments = supabase.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).execute()
                accessible_folder_ids = [fa["folder_id"] for fa in folder_assignments.data] if folder_assignments.data else []
                
                if accessible_folder_ids:
                    query = query.in_("id", accessible_folder_ids)
                else:
                    # User has no assigned folders, return empty list
                    return []
            except Exception as e:
                print(f"Error checking folder assignments: {str(e)}")
                # If folder_assignments table doesn't exist yet, return empty
                return []
        
        response = query.order("created_at", desc=True).execute()
        return response.data if response.data else []
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
        
        response = supabase.table("folders").select("*").eq("id", folder_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        folder = response.data
        
        # Check access if not admin
        if not is_admin:
            # Check if folder is assigned to user
            try:
                assignment = supabase.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
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
        
        response = supabase.table("folders").insert(folder_data).execute()
        
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
                supabase.table("folder_assignments").insert(assignment_data).execute()
            except Exception as assign_error:
                print(f"Warning: Could not create folder assignment: {str(assign_error)}")
        
        # If quote_id is provided, update quote to link to folder
        if folder.quote_id:
            try:
                supabase.table("quotes").update({"folder_id": folder_id}).eq("id", folder.quote_id).execute()
            except Exception as quote_error:
                print(f"Warning: Could not update quote: {str(quote_error)}")
        
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
        existing = supabase.table("folders").select("*").eq("id", folder_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Check access
        if not is_admin and existing.data.get("created_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Update folder
        update_data = folder_update.model_dump(exclude_none=True)
        response = supabase.table("folders").update(update_data).eq("id", folder_id).execute()
        
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
        
        # Delete folder (cascade will handle assignments)
        try:
            client.table("folders").delete().eq("id", folder_id).execute()
            logger.info(f"Folder {folder_id} deleted successfully by user {user['id']}")
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
        
        # Verify folder exists
        folder_response = supabase.table("folders").select("id").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Create assignment
        assignment_data = assignment.model_dump(exclude_none=True)
        assignment_data["folder_id"] = folder_id
        assignment_data["assigned_by"] = user["id"]
        
        response = supabase.table("folder_assignments").insert(assignment_data).execute()
        
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
        
        # Check folder access
        folder_response = supabase.table("folders").select("*").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        if not is_admin:
            # Check if user has access to folder
            try:
                assignment = supabase.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
            except Exception:
                if folder_response.data.get("created_by") != user["id"]:
                    raise HTTPException(status_code=403, detail="Access denied")
        
        response = supabase.table("folder_assignments").select("*").eq("folder_id", folder_id).execute()
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
        
        # Use service role client for admins to bypass RLS, regular client for users
        client = supabase_storage if is_admin else supabase
        
        # Check folder access
        try:
            folder_response = client.table("folders").select("*").eq("id", folder_id).single().execute()
            if not folder_response.data:
                raise HTTPException(status_code=404, detail="Folder not found")
        except Exception as e:
            logger.error(f"Error fetching folder: {str(e)}")
            raise HTTPException(status_code=404, detail="Folder not found")
        
        if not is_admin:
            # Check if user has access to folder
            try:
                assignment = supabase.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
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
        
        # Get files assigned to folder
        # Include both: reusable files (via many-to-many) and instances (via direct folder_id)
        files = []
        try:
            # Get reusable files assigned via many-to-many relationship
            file_assignments = supabase_storage.table("file_folder_assignments").select("file_id").eq("folder_id", folder_id).execute()
            reusable_file_ids = [fa["file_id"] for fa in (file_assignments.data or [])]
            
            # Get instances directly assigned to folder (non-reusable)
            instances_response = supabase_storage.table("files").select("*").eq("folder_id", folder_id).eq("is_reusable", False).execute()
            instances = instances_response.data if instances_response.data else []
            
            # Get reusable files
            if reusable_file_ids:
                reusable_response = supabase_storage.table("files").select("*").in_("id", reusable_file_ids).execute()
                reusable_files = reusable_response.data if reusable_response.data else []
            else:
                reusable_files = []
            
            # Combine reusable files and instances
            files = reusable_files + instances
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
            
            # Note: Forms don't have direct folder_id, so instances are only via assignments
            # For now, we show templates. If we add instance support later, we can add it here.
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
            esignatures = instances_response.data if instances_response.data else []
        except Exception as e:
            logger.warning(f"Error fetching e-signatures: {str(e)}")
            pass
        
        return {
            "folder": folder,
            "quote": quote,
            "files": files,
            "forms": forms,
            "esignatures": esignatures
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Error getting folder content: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to get folder content: {str(e)}")

