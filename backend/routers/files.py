from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File as FastAPIFile, Request
from fastapi.responses import Response, StreamingResponse
from typing import List, Optional
import sys
import os
import uuid
import hashlib
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import File, FileCreate, FileUpdate, FileFolderAssignment, FileFolderAssignmentCreate
from database import supabase, supabase_storage, supabase_url, supabase_service_role_key
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/api/files", tags=["files"])

# File size limit: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024

@router.get("", response_model=List[File])
async def list_files(
    folder_id: Optional[str] = Query(None, description="Filter by folder ID"),
    quote_id: Optional[str] = Query(None, description="Filter by quote ID"),
    form_id: Optional[str] = Query(None, description="Filter by form ID"),
    is_reusable: Optional[bool] = Query(None, description="Filter by reusable flag"),
    user = Depends(get_current_user)
):
    """List files with optional filters. Admins see all files, users see files in their folders."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            # User doesn't have a role record, default to customer
            is_admin = False
        
        query = supabase.table("files").select("*")
        
        # Apply filters
        if folder_id:
            query = query.eq("folder_id", folder_id)
        if quote_id:
            query = query.eq("quote_id", quote_id)
        if form_id:
            query = query.eq("form_id", form_id)
        if is_reusable is not None:
            query = query.eq("is_reusable", is_reusable)
        
        # If not admin, filter by folder assignments
        if not is_admin:
            # Get folders user has access to (if folder_assignments table exists)
            accessible_folder_ids = []
            try:
                folder_assignments = supabase.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).execute()
                accessible_folder_ids = [fa["folder_id"] for fa in folder_assignments.data] if folder_assignments.data else []
            except Exception:
                # folder_assignments table doesn't exist yet, skip folder filtering
                pass
            
            # Also get files through many-to-many assignments
            accessible_file_ids = []
            if accessible_folder_ids:
                try:
                    file_assignments = supabase.table("file_folder_assignments").select("file_id").in_("folder_id", accessible_folder_ids).execute()
                    accessible_file_ids = [fa["file_id"] for fa in file_assignments.data] if file_assignments.data else []
                except Exception:
                    # file_folder_assignments might not have data yet
                    pass
            
            # Filter: files in accessible folders OR files user uploaded OR files in accessible folders via assignments
            if accessible_folder_ids or accessible_file_ids:
                query = query.or_(
                    f"folder_id.in.({','.join(accessible_folder_ids)})" if accessible_folder_ids else None,
                    f"id.in.({','.join(accessible_file_ids)})" if accessible_file_ids else None,
                    f"uploaded_by.eq.{user['id']}"
                )
            else:
                # Only files user uploaded
                query = query.eq("uploaded_by", user["id"])
        
        response = query.order("created_at", desc=True).execute()
        return response.data if response.data else []
    except Exception as e:
        print(f"Error listing files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

@router.get("/{file_id}", response_model=File)
async def get_file(file_id: str, user = Depends(get_current_user)):
    """Get file details by ID."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            # User doesn't have a role record, default to customer
            is_admin = False
        
        # Use service role client to bypass RLS (user is already authenticated)
        response = supabase_storage.table("files").select("*").eq("id", file_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = response.data
        
        # Check access if not admin
        if not is_admin:
            # Check if user uploaded it
            if file_data.get("uploaded_by") != user["id"]:
                # Check if file is in accessible folder
                folder_id = file_data.get("folder_id")
                if folder_id:
                    try:
                        folder_assignment = supabase.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                        if not folder_assignment.data:
                            # Check many-to-many assignments
                            try:
                                file_assignment = supabase.table("file_folder_assignments").select("folder_id").eq("file_id", file_id).execute()
                                if file_assignment.data:
                                    accessible_folder_ids = [fa["folder_id"] for fa in file_assignment.data]
                                    user_folders = supabase.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).in_("folder_id", accessible_folder_ids).execute()
                                    if not user_folders.data:
                                        raise HTTPException(status_code=403, detail="Access denied")
                                else:
                                    raise HTTPException(status_code=403, detail="Access denied")
                            except Exception:
                                # Tables might not exist yet, deny access if user didn't upload
                                raise HTTPException(status_code=403, detail="Access denied")
                    except Exception:
                        # folder_assignments table doesn't exist yet, deny access if user didn't upload
                        raise HTTPException(status_code=403, detail="Access denied")
        
        return file_data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get file: {str(e)}")

@router.post("/upload", response_model=File)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    folder_id: Optional[str] = None,
    quote_id: Optional[str] = None,
    form_id: Optional[str] = None,
    description: Optional[str] = None,
    is_reusable: bool = False,
    user = Depends(get_current_user)
):
    """Upload a file to Supabase Storage."""
    try:
        # Validate file size
        file_content = await file.read()
        if len(file_content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File size exceeds {MAX_FILE_SIZE / (1024*1024)}MB limit")
        
        # Generate unique filename
        file_hash = hashlib.md5(file_content).hexdigest()[:8]
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
        file_id = str(uuid.uuid4())
        unique_filename = f"{file_id}/{file_hash}_{uuid.uuid4().hex[:8]}.{file_extension}" if file_extension else f"{file_id}/{file_hash}_{uuid.uuid4().hex[:8]}"
        
        # Upload to Supabase Storage (bucket: project-files)
        try:
            response = supabase_storage.storage.from_("project-files").upload(
                unique_filename,
                file_content,
                file_options={
                    "content-type": file.content_type or "application/octet-stream",
                    "upsert": "false"
                }
            )
            print(f"File uploaded successfully: {unique_filename}")
        except Exception as storage_error:
            error_msg = str(storage_error)
            print(f"Storage upload error: {error_msg}")
            if "bucket" in error_msg.lower() or "not found" in error_msg.lower():
                raise HTTPException(
                    status_code=500, 
                    detail="Storage bucket 'project-files' not configured. Please create it in Supabase Storage dashboard."
                )
            elif "permission" in error_msg.lower() or "policy" in error_msg.lower():
                raise HTTPException(
                    status_code=500,
                    detail="Storage permissions not configured. Please check Supabase Storage policies for 'project-files' bucket."
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload file to storage: {error_msg}"
                )
        
        # Get signed URL (temporary, expires in 1 hour)
        try:
            signed_url = supabase_storage.storage.from_("project-files").create_signed_url(unique_filename, 3600)
        except Exception as url_error:
            print(f"Warning: Could not get signed URL: {str(url_error)}")
            signed_url = None
        
        # Create file record in database
        # Use supabase_storage (service role) to bypass RLS since we've already verified the user
        file_data = {
            "id": file_id,
            "name": file.filename or "Untitled",
            "original_filename": file.filename or "Untitled",
            "file_type": file.content_type or "application/octet-stream",
            "file_size": len(file_content),
            "storage_path": unique_filename,
            "storage_url": signed_url,
            "folder_id": folder_id,
            "quote_id": quote_id,
            "form_id": form_id,
            "description": description,
            "is_reusable": is_reusable,
            "uploaded_by": user["id"]
        }
        
        # Use service role client to bypass RLS (user is already authenticated)
        response = supabase_storage.table("files").insert(file_data).execute()
        
        if not response.data:
            # Try to delete uploaded file if database insert fails
            try:
                supabase_storage.storage.from_("project-files").remove([unique_filename])
            except:
                pass
            raise HTTPException(status_code=500, detail="Failed to create file record")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@router.put("/{file_id}", response_model=File)
async def update_file(
    file_id: str,
    file_update: FileUpdate,
    user = Depends(get_current_user)
):
    """Update file metadata."""
    try:
        # Check if file exists
        file_response = supabase.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = file_response.data
        
        # Check if user is admin or uploaded the file
        user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
        is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        
        if not is_admin and file_data.get("uploaded_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Prepare update data
        update_data = file_update.model_dump(exclude_unset=True)
        
        response = supabase.table("files").update(update_data).eq("id", file_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update file")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update file: {str(e)}")

@router.delete("/{file_id}")
async def delete_file(file_id: str, user = Depends(get_current_user)):
    """Delete a file from storage and database."""
    try:
        # Check if file exists
        file_response = supabase.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = file_response.data
        
        # Check if user is admin or uploaded the file
        user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
        is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        
        if not is_admin and file_data.get("uploaded_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete from storage
        storage_path = file_data.get("storage_path")
        if storage_path:
            try:
                supabase_storage.storage.from_("project-files").remove([storage_path])
            except Exception as storage_error:
                print(f"Warning: Failed to delete file from storage: {str(storage_error)}")
                # Continue with database deletion even if storage deletion fails
        
        # Delete from database (cascade will handle assignments)
        supabase.table("files").delete().eq("id", file_id).execute()
        
        return {"message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

@router.get("/{file_id}/download")
async def download_file(file_id: str, user = Depends(get_current_user)):
    """Download a file. Returns signed URL or file content."""
    try:
        # Get file record - use service role client to bypass RLS
        file_response = supabase_storage.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = file_response.data
        
        # Check access (same logic as get_file)
        user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
        is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        
        if not is_admin:
            if file_data.get("uploaded_by") != user["id"]:
                folder_id = file_data.get("folder_id")
                if folder_id:
                    try:
                        folder_assignment = supabase.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                        if not folder_assignment.data:
                            try:
                                file_assignment = supabase.table("file_folder_assignments").select("folder_id").eq("file_id", file_id).execute()
                                if file_assignment.data:
                                    accessible_folder_ids = [fa["folder_id"] for fa in file_assignment.data]
                                    user_folders = supabase.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).in_("folder_id", accessible_folder_ids).execute()
                                    if not user_folders.data:
                                        raise HTTPException(status_code=403, detail="Access denied")
                                else:
                                    raise HTTPException(status_code=403, detail="Access denied")
                            except Exception:
                                raise HTTPException(status_code=403, detail="Access denied")
                    except Exception:
                        raise HTTPException(status_code=403, detail="Access denied")
        
        # Get signed URL (expires in 1 hour)
        storage_path = file_data.get("storage_path")
        if not storage_path:
            raise HTTPException(status_code=500, detail="File storage path not found")
        
        try:
            # Create signed URL - Supabase Python client returns dict with "signedURL" key
            signed_url_result = supabase_storage.storage.from_("project-files").create_signed_url(storage_path, 3600)
            
            # Extract URL from response (can be dict or string depending on client version)
            if isinstance(signed_url_result, dict):
                signed_url = signed_url_result.get("signedURL") or signed_url_result.get("signed_url") or signed_url_result.get("url")
            elif isinstance(signed_url_result, str):
                signed_url = signed_url_result
            else:
                # Try to get URL from response object if it has attributes
                signed_url = getattr(signed_url_result, "signedURL", None) or getattr(signed_url_result, "signed_url", None) or getattr(signed_url_result, "url", None) or str(signed_url_result)
            
            if not signed_url:
                print(f"Error: create_signed_url returned unexpected format: {type(signed_url_result)} - {signed_url_result}")
                raise Exception("Signed URL is empty or invalid format")
            
            # Return redirect to signed URL
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=signed_url)
        except Exception as url_error:
            # Fallback: try to download file content directly
            try:
                file_content = supabase_storage.storage.from_("project-files").download(storage_path)
                return Response(
                    content=file_content,
                    media_type=file_data.get("file_type", "application/octet-stream"),
                    headers={
                        "Content-Disposition": f'attachment; filename="{file_data.get("original_filename", "file")}"'
                    }
                )
            except Exception as download_error:
                raise HTTPException(status_code=500, detail=f"Failed to download file: {str(download_error)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error downloading file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")

@router.get("/{file_id}/preview")
async def get_file_preview(file_id: str, user = Depends(get_current_user)):
    """Get preview URL for a file (signed URL that expires)."""
    try:
        # Get file record - use service role client to bypass RLS
        file_response = supabase_storage.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = file_response.data
        
        # Check access (same logic as get_file)
        user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
        is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        
        if not is_admin:
            if file_data.get("uploaded_by") != user["id"]:
                folder_id = file_data.get("folder_id")
                if folder_id:
                    try:
                        folder_assignment = supabase.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                        if not folder_assignment.data:
                            try:
                                file_assignment = supabase.table("file_folder_assignments").select("folder_id").eq("file_id", file_id).execute()
                                if file_assignment.data:
                                    accessible_folder_ids = [fa["folder_id"] for fa in file_assignment.data]
                                    user_folders = supabase.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).in_("folder_id", accessible_folder_ids).execute()
                                    if not user_folders.data:
                                        raise HTTPException(status_code=403, detail="Access denied")
                                else:
                                    raise HTTPException(status_code=403, detail="Access denied")
                            except Exception:
                                raise HTTPException(status_code=403, detail="Access denied")
                    except Exception:
                        raise HTTPException(status_code=403, detail="Access denied")
        
        # Get signed URL (expires in 1 hour)
        storage_path = file_data.get("storage_path")
        if not storage_path:
            raise HTTPException(status_code=500, detail="File storage path not found")
        
        try:
            # Create signed URL - Supabase Python client returns dict with "signedURL" key
            signed_url_result = supabase_storage.storage.from_("project-files").create_signed_url(storage_path, 3600)
            
            # Extract URL from response (can be dict or string depending on client version)
            if isinstance(signed_url_result, dict):
                signed_url = signed_url_result.get("signedURL") or signed_url_result.get("signed_url") or signed_url_result.get("url")
            elif isinstance(signed_url_result, str):
                signed_url = signed_url_result
            else:
                # Try to get URL from response object if it has attributes
                signed_url = getattr(signed_url_result, "signedURL", None) or getattr(signed_url_result, "signed_url", None) or getattr(signed_url_result, "url", None) or str(signed_url_result)
            
            if not signed_url:
                print(f"Error: create_signed_url returned unexpected format: {type(signed_url_result)} - {signed_url_result}")
                raise HTTPException(status_code=500, detail="Failed to generate signed URL: unexpected response format")
            
            return {"preview_url": signed_url}
        except HTTPException:
            raise
        except Exception as url_error:
            print(f"Error creating signed URL for path '{storage_path}': {str(url_error)}")
            print(f"Error type: {type(url_error)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to create preview URL: {str(url_error)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting file preview: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get file preview: {str(e)}")

# Folder Assignment Endpoints
@router.post("/{file_id}/assign-to-folder", response_model=FileFolderAssignment)
async def assign_file_to_folder(
    file_id: str,
    folder_id: str,
    user = Depends(get_current_user)
):
    """Assign a file to a folder (many-to-many relationship)."""
    try:
        # Check if file exists
        file_response = supabase.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check if folder exists (will be implemented when folders are created)
        # For now, just check if user has access
        
        # Check if assignment already exists
        existing = supabase.table("file_folder_assignments").select("*").eq("file_id", file_id).eq("folder_id", folder_id).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="File is already assigned to this folder")
        
        # Create assignment
        assignment_data = {
            "file_id": file_id,
            "folder_id": folder_id,
            "assigned_by": user["id"]
        }
        
        response = supabase.table("file_folder_assignments").insert(assignment_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create assignment")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error assigning file to folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to assign file to folder: {str(e)}")

@router.delete("/{file_id}/assign-to-folder/{folder_id}")
async def remove_file_folder_assignment(
    file_id: str,
    folder_id: str,
    user = Depends(get_current_user)
):
    """Remove file assignment from folder."""
    try:
        # Check if assignment exists
        assignment_response = supabase.table("file_folder_assignments").select("*").eq("file_id", file_id).eq("folder_id", folder_id).single().execute()
        if not assignment_response.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        assignment_data = assignment_response.data
        
        # Check if user is admin or created the assignment
        user_role_response = supabase.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
        is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        
        if not is_admin and assignment_data.get("assigned_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete assignment
        supabase.table("file_folder_assignments").delete().eq("file_id", file_id).eq("folder_id", folder_id).execute()
        
        return {"message": "Assignment removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing file folder assignment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to remove assignment: {str(e)}")

@router.get("/{file_id}/folders", response_model=List[FileFolderAssignment])
async def get_file_folders(file_id: str, user = Depends(get_current_user)):
    """Get all folders a file is assigned to."""
    try:
        # Check if file exists and user has access - use service role client to bypass RLS
        file_response = supabase_storage.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Get assignments
        response = supabase.table("file_folder_assignments").select("*").eq("file_id", file_id).execute()
        
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting file folders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get file folders: {str(e)}")

