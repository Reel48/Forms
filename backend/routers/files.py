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
    templates_only: bool = Query(True, description="Show only reusable files (for template library)"),
    user = Depends(get_current_user)
):
    """List files with optional filters.
    - If templates_only=True (default): Shows only reusable files (template library)
    - If folder_id provided: Shows all files in folder (templates + instances)
    - Admins see all files, users see files in their folders."""
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            # User doesn't have a role record, default to customer
            is_admin = False
        
        # Use service role client to bypass RLS (user is already authenticated)
        query = supabase_storage.table("files").select("*")
        
        # Apply filters
        if folder_id:
            # When viewing folder content, show ONLY folder-specific files
            # (not reusable templates assigned via many-to-many)
            query = query.eq("folder_id", folder_id).eq("is_reusable", False)
        elif templates_only:
            # For template library (main page), show only reusable files
            # Exclude folder-specific files (those with folder_id set)
            query = query.eq("is_reusable", True).is_("folder_id", "null")
        
        if quote_id:
            query = query.eq("quote_id", quote_id)
        if form_id:
            query = query.eq("form_id", form_id)
        if is_reusable is not None:
            query = query.eq("is_reusable", is_reusable)
        
        # If not admin, filter by access
        if not is_admin:
            if folder_id:
                # When viewing folder content, verify user has access to folder
                # Then show only folder-specific files in that folder
                try:
                    folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                    if not folder_assignment.data:
                        # User doesn't have access to this folder
                        return []
                    # User has access - query already filtered by folder_id and is_reusable=False
                except Exception:
                    # If folder_assignments check fails, deny access
                    return []
            elif templates_only:
                # For template library, show all templates the user created
                query = query.eq("uploaded_by", user["id"])
            else:
                # For regular file list (no folder_id), filter by folder access
                # Get folders user has access to
                accessible_folder_ids = []
                try:
                    folder_assignments = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).execute()
                    accessible_folder_ids = [fa["folder_id"] for fa in folder_assignments.data] if folder_assignments.data else []
                except Exception:
                    pass
                
                # Get files user uploaded
                user_files_query = supabase_storage.table("files").select("*")
                if quote_id:
                    user_files_query = user_files_query.eq("quote_id", quote_id)
                if form_id:
                    user_files_query = user_files_query.eq("form_id", form_id)
                if is_reusable is not None:
                    user_files_query = user_files_query.eq("is_reusable", is_reusable)
                user_files_query = user_files_query.eq("uploaded_by", user["id"])
                user_files_response = user_files_query.execute()
                user_file_ids = {f["id"] for f in (user_files_response.data or [])}
                
                # Get files in accessible folders
                accessible_file_ids = set(user_file_ids)
                if accessible_folder_ids:
                    folder_files_query = supabase_storage.table("files").select("*")
                    if quote_id:
                        folder_files_query = folder_files_query.eq("quote_id", quote_id)
                    if form_id:
                        folder_files_query = folder_files_query.eq("form_id", form_id)
                    if is_reusable is not None:
                        folder_files_query = folder_files_query.eq("is_reusable", is_reusable)
                    folder_files_query = folder_files_query.in_("folder_id", accessible_folder_ids)
                    folder_files_response = folder_files_query.execute()
                    folder_file_ids = {f["id"] for f in (folder_files_response.data or [])}
                    accessible_file_ids.update(folder_file_ids)
                
                # If no accessible files, return empty list
                if not accessible_file_ids:
                    return []
                
                # Query files by accessible IDs
                query = query.in_("id", list(accessible_file_ids))
        
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
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
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
                        folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                        if not folder_assignment.data:
                            # Check many-to-many assignments
                            try:
                                file_assignment = supabase_storage.table("file_folder_assignments").select("folder_id").eq("file_id", file_id).execute()
                                if file_assignment.data:
                                    accessible_folder_ids = [fa["folder_id"] for fa in file_assignment.data]
                                    user_folders = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).in_("folder_id", accessible_folder_ids).execute()
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
        
        # Track file view (idempotent - uses UNIQUE constraint)
        try:
            from datetime import datetime
            view_data = {
                "file_id": file_id,
                "user_id": user["id"],
                "viewed_at": datetime.now().isoformat()
            }
            # Use INSERT ... ON CONFLICT DO NOTHING to make it idempotent
            supabase_storage.table("file_views").insert(view_data).execute()
        except Exception as view_error:
            # Log but don't fail the request if view tracking fails
            print(f"Warning: Failed to track file view: {str(view_error)}")
        
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
    is_reusable: Optional[bool] = None,  # If None, auto-detect based on folder_id
    user = Depends(get_current_user)
):
    """Upload a file to Supabase Storage.
    
    If folder_id is provided:
    - File is folder-specific (is_reusable=False)
    - User must have access to the folder (admin or assigned customer)
    - File will only appear in that folder
    
    If folder_id is not provided:
    - File is a template (is_reusable=True by default)
    - Only admins can upload templates
    """
    try:
        # Check if user is admin
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            is_admin = False
        
        # If folder_id is provided, verify user has access to folder
        if folder_id:
            # Verify folder exists
            folder_response = supabase_storage.table("folders").select("id").eq("id", folder_id).single().execute()
            if not folder_response.data:
                raise HTTPException(status_code=404, detail="Folder not found")
            
            # Check folder access (admin or assigned customer)
            if not is_admin:
                folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                if not folder_assignment.data:
                    raise HTTPException(status_code=403, detail="You don't have access to this folder")
            
            # Folder-specific files are NOT reusable
            is_reusable = False
        else:
            # No folder_id: this is a template upload
            # Only admins can upload templates
            if not is_admin:
                raise HTTPException(status_code=403, detail="Only admins can upload template files")
            # Default to reusable if not specified
            if is_reusable is None:
                is_reusable = True
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
            "is_reusable": is_reusable,  # Use the provided value (defaults to True)
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

        created_file = response.data[0]

        # Best-effort folder event (only for folder uploads, not templates)
        if folder_id:
            try:
                supabase_storage.table("folder_events").insert({
                    "id": str(uuid.uuid4()),
                    "folder_id": folder_id,
                    "event_type": "file_uploaded",
                    "title": f"File uploaded: {created_file.get('name') or 'File'}",
                    "details": {"file_id": created_file.get("id"), "name": created_file.get("name"), "storage_path": created_file.get("storage_path")},
                    "created_by": user.get("id"),
                    "created_at": datetime.now().isoformat(),
                }).execute()
            except Exception:
                pass

        return created_file
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
        # Check if file exists - use service role client to bypass RLS
        file_response = supabase_storage.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = file_response.data
        
        # Check if user is admin or uploaded the file
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            # User doesn't have a role record, default to customer
            is_admin = False
        
        if not is_admin and file_data.get("uploaded_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Prepare update data
        update_data = file_update.model_dump(exclude_unset=True)
        
        # Use service role client to bypass RLS
        response = supabase_storage.table("files").update(update_data).eq("id", file_id).execute()
        
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
        # Check if file exists - use service role client to bypass RLS
        file_response = supabase_storage.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_data = file_response.data
        
        # Check if user is admin or uploaded the file
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            # User doesn't have a role record, default to customer
            is_admin = False
        
        if not is_admin and file_data.get("uploaded_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Check if file is referenced by e-signature signatures (signed_file_id)
        signature_check = supabase_storage.table("esignature_signatures").select("id, document_id").eq("signed_file_id", file_id).limit(1).execute()
        if signature_check.data and len(signature_check.data) > 0:
            # Get document name for better error message
            try:
                signature = signature_check.data[0]
                doc_response = supabase_storage.table("esignature_documents").select("name").eq("id", signature.get("document_id")).single().execute()
                doc_name = doc_response.data.get("name", "an e-signature document") if doc_response.data else "an e-signature document"
            except Exception:
                doc_name = "an e-signature document"
            
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete file: This file is associated with a signed e-signature document ({doc_name}). Signed documents cannot be deleted to maintain record integrity."
            )
        
        # Check if file is referenced by e-signature documents (file_id)
        document_check = supabase_storage.table("esignature_documents").select("id, name").eq("file_id", file_id).limit(1).execute()
        if document_check.data and len(document_check.data) > 0:
            doc_name = document_check.data[0].get("name", "an e-signature document")
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete file: This file is associated with an e-signature document ({doc_name}). Please remove the e-signature document first."
            )
        
        # Delete from storage
        storage_path = file_data.get("storage_path")
        if storage_path:
            try:
                supabase_storage.storage.from_("project-files").remove([storage_path])
            except Exception as storage_error:
                print(f"Warning: Failed to delete file from storage: {str(storage_error)}")
                # Continue with database deletion even if storage deletion fails
        
        # Delete from database (cascade will handle assignments) - use service role client
        supabase_storage.table("files").delete().eq("id", file_id).execute()
        
        return {"message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting file: {str(e)}")
        # Check if it's a foreign key constraint error
        error_str = str(e)
        if "foreign key constraint" in error_str.lower() or "23503" in error_str:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete file: This file is referenced by other records (e.g., signed e-signature documents). Please remove those references first."
            )
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
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            # User doesn't have a role record, default to customer
            is_admin = False
        
        if not is_admin:
            if file_data.get("uploaded_by") != user["id"]:
                folder_id = file_data.get("folder_id")
                if folder_id:
                    try:
                        folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                        if not folder_assignment.data:
                            try:
                                file_assignment = supabase_storage.table("file_folder_assignments").select("folder_id").eq("file_id", file_id).execute()
                                if file_assignment.data:
                                    accessible_folder_ids = [fa["folder_id"] for fa in file_assignment.data]
                                    user_folders = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).in_("folder_id", accessible_folder_ids).execute()
                                    if not user_folders.data:
                                        raise HTTPException(status_code=403, detail="Access denied")
                                else:
                                    raise HTTPException(status_code=403, detail="Access denied")
                            except Exception:
                                raise HTTPException(status_code=403, detail="Access denied")
                    except Exception:
                        raise HTTPException(status_code=403, detail="Access denied")
        
        # Track file view (idempotent - uses UNIQUE constraint)
        try:
            from datetime import datetime
            view_data = {
                "file_id": file_id,
                "user_id": user["id"],
                "viewed_at": datetime.now().isoformat()
            }
            # Use INSERT ... ON CONFLICT DO NOTHING to make it idempotent
            supabase_storage.table("file_views").insert(view_data).execute()
        except Exception as view_error:
            # Log but don't fail the request if view tracking fails
            print(f"Warning: Failed to track file view: {str(view_error)}")
        
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
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            # User doesn't have a role record, default to customer
            is_admin = False
        
        if not is_admin:
            if file_data.get("uploaded_by") != user["id"]:
                folder_id = file_data.get("folder_id")
                if folder_id:
                    try:
                        folder_assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
                        if not folder_assignment.data:
                            try:
                                file_assignment = supabase_storage.table("file_folder_assignments").select("folder_id").eq("file_id", file_id).execute()
                                if file_assignment.data:
                                    accessible_folder_ids = [fa["folder_id"] for fa in file_assignment.data]
                                    user_folders = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", user["id"]).in_("folder_id", accessible_folder_ids).execute()
                                    if not user_folders.data:
                                        raise HTTPException(status_code=403, detail="Access denied")
                                else:
                                    raise HTTPException(status_code=403, detail="Access denied")
                            except Exception:
                                raise HTTPException(status_code=403, detail="Access denied")
                    except Exception:
                        raise HTTPException(status_code=403, detail="Access denied")
        
        # Track file view (idempotent - uses UNIQUE constraint)
        try:
            from datetime import datetime
            view_data = {
                "file_id": file_id,
                "user_id": user["id"],
                "viewed_at": datetime.now().isoformat()
            }
            # Use INSERT ... ON CONFLICT DO NOTHING to make it idempotent
            supabase_storage.table("file_views").insert(view_data).execute()
        except Exception as view_error:
            # Log but don't fail the request if view tracking fails
            print(f"Warning: Failed to track file view: {str(view_error)}")
        
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
        file_response = supabase_storage.table("files").select("*").eq("id", file_id).single().execute()
        if not file_response.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check if folder exists (will be implemented when folders are created)
        # For now, just check if user has access
        
        # Check if assignment already exists
        existing = supabase_storage.table("file_folder_assignments").select("*").eq("file_id", file_id).eq("folder_id", folder_id).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="File is already assigned to this folder")
        
        # Create assignment
        assignment_data = {
            "file_id": file_id,
            "folder_id": folder_id,
            "assigned_by": user["id"]
        }
        
        response = supabase_storage.table("file_folder_assignments").insert(assignment_data).execute()
        
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
        # Check if assignment exists - use service role client to bypass RLS
        assignment_response = supabase_storage.table("file_folder_assignments").select("*").eq("file_id", file_id).eq("folder_id", folder_id).single().execute()
        if not assignment_response.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        assignment_data = assignment_response.data
        
        # Check if user is admin or created the assignment - use service role client to bypass RLS
        is_admin = False
        try:
            user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", user["id"]).single().execute()
            is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
        except Exception:
            is_admin = False
        
        if not is_admin and assignment_data.get("assigned_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete assignment - use service role client to bypass RLS
        # Get the assignment ID first, then delete by ID (more reliable)
        assignment_id = assignment_response.data["id"]
        delete_response = supabase_storage.table("file_folder_assignments").delete().eq("id", assignment_id).execute()
        
        # Verify deletion - check if assignment still exists
        verify_check = supabase_storage.table("file_folder_assignments").select("id").eq("file_id", file_id).eq("folder_id", folder_id).execute()
        if verify_check.data:
            print(f"Error: Assignment still exists after delete attempt for file {file_id}, folder {folder_id}")
            raise HTTPException(status_code=500, detail="Failed to remove assignment - assignment still exists")
        
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
        response = supabase_storage.table("file_folder_assignments").select("*").eq("file_id", file_id).execute()
        
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting file folders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get file folders: {str(e)}")

