"""
Webhook endpoints for external services (Typeform, etc.)
"""
from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional, Dict, Any, List
from datetime import datetime
import uuid
import logging
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import supabase_storage, supabase_url, supabase_service_role_key

router = APIRouter()
logger = logging.getLogger(__name__)


def _create_form_completion_record(
    form_id: str,
    folder_id: str,
    submitter_email: Optional[str] = None,
    submitter_name: Optional[str] = None,
    source: str = "typeform_webhook"
) -> Dict[str, Any]:
    """
    Helper function to create a form completion record.
    Can be called from both authenticated endpoints and webhooks.
    
    Returns:
        Dict with success status and submission_id
    """
    try:
        # Ensure the form is assigned to this folder
        assignment = (
            supabase_storage
            .table("form_folder_assignments")
            .select("id")
            .eq("form_id", form_id)
            .eq("folder_id", folder_id)
            .limit(1)
            .execute()
        ).data or []
        
        if not assignment:
            logger.warning(f"Form {form_id} is not assigned to folder {folder_id}, skipping completion record")
            return {"success": False, "error": "Form not assigned to folder"}
        
        assignment_id = assignment[0].get("id")
        
        # Idempotency: check if completion record already exists
        # For webhooks, we check by folder_id + form_id + submitter_email (if available)
        existing_query = (
            supabase_storage
            .table("form_submissions")
            .select("id")
            .eq("form_id", form_id)
            .eq("folder_id", folder_id)
            .eq("status", "completed")
        )
        
        if submitter_email:
            submitter_email_norm = submitter_email.lower().strip()
            existing_query = existing_query.eq("submitter_email", submitter_email_norm)
        
        existing = existing_query.limit(1).execute().data or []
        
        if existing:
            logger.info(f"Completion record already exists for form {form_id}, folder {folder_id}")
            return {
                "success": True,
                "submission_id": existing[0].get("id"),
                "already_completed": True
            }
        
        # Create new completion record
        now = datetime.now().isoformat()
        submission_id = str(uuid.uuid4())
        
        insert_data = {
            "id": submission_id,
            "form_id": form_id,
            "folder_id": folder_id,
            "submitter_email": submitter_email.lower().strip() if submitter_email else None,
            "submitter_name": submitter_name,
            "status": "completed",
            "review_status": f"completed:{source}",
            "submitted_at": now,
            "started_at": now,
            "assignment_id": assignment_id,
        }
        
        # Insert using service role (bypasses RLS)
        try:
            resp = supabase_storage.table("form_submissions").insert(insert_data).execute()
            if not resp.data:
                raise RuntimeError("Insert returned no data")
            logger.info(f"Created completion record {submission_id} for form {form_id}, folder {folder_id}")
        except Exception as insert_err:
            # Fallback: direct REST with service role headers
            if not supabase_service_role_key or not supabase_url:
                logger.error("mark-complete insert failed and service role not configured", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to mark form as completed: {str(insert_err)}"
                )
            
            try:
                import requests as http_requests
                
                headers = {
                    "apikey": supabase_service_role_key,
                    "Authorization": f"Bearer {supabase_service_role_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                }
                
                r = http_requests.post(
                    f"{supabase_url}/rest/v1/form_submissions",
                    headers=headers,
                    json=insert_data,
                    timeout=10,
                )
                if r.status_code >= 400:
                    try:
                        err_json = r.json()
                    except Exception:
                        err_json = {"message": r.text}
                    logger.error("mark-complete REST insert failed: %s", err_json)
                    raise HTTPException(status_code=500, detail=str(err_json))
                logger.info(f"Created completion record {submission_id} via REST for form {form_id}, folder {folder_id}")
            except HTTPException:
                raise
            except Exception as rest_err:
                logger.error("mark-complete REST fallback failed", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to mark form as completed: {str(rest_err)}"
                )
        
        return {
            "success": True,
            "submission_id": submission_id,
            "already_completed": False
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating completion record: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _extract_typeform_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract relevant data from Typeform webhook payload.
    
    Returns:
        Dict with:
        - typeform_form_id: The Typeform form ID
        - submitter_email: Email from answers or hidden fields
        - folder_id: Folder ID from hidden fields (if present)
        - user_id: User ID from hidden fields (if present)
        - submitted_at: Submission timestamp
    """
    form_response = payload.get("form_response", {})
    form_id = form_response.get("form_id") or form_response.get("form", {}).get("id")
    
    # Extract hidden fields
    hidden = form_response.get("hidden", {})
    folder_id = hidden.get("folder_id")
    user_id = hidden.get("user_id")
    submitter_email_from_hidden = hidden.get("submitter_email")
    
    # Extract email from answers
    submitter_email = submitter_email_from_hidden
    answers = form_response.get("answers", [])
    
    for answer in answers:
        if answer.get("type") == "email" and answer.get("email"):
            submitter_email = answer.get("email")
            break
        # Also check field refs that might contain email
        field = answer.get("field", {})
        if field.get("type") == "email" and answer.get("email"):
            submitter_email = answer.get("email")
            break
    
    submitted_at = form_response.get("submitted_at")
    
    return {
        "typeform_form_id": form_id,
        "submitter_email": submitter_email,
        "folder_id": folder_id,
        "user_id": user_id,
        "submitted_at": submitted_at,
    }


def _find_folders_by_email(
    submitter_email: str,
    form_id: str
) -> List[str]:
    """
    Find folders where the form is assigned, matching by submitter email.
    
    Strategy:
    1. Find client by email
    2. Find folders by client_id
    3. Filter to folders where form is assigned
    
    Returns:
        List of folder IDs
    """
    folder_ids = []
    
    try:
        submitter_email_norm = submitter_email.lower().strip()
        if not submitter_email_norm:
            return folder_ids
        
        # Find client by email
        client_resp = (
            supabase_storage
            .table("clients")
            .select("id")
            .eq("email", submitter_email_norm)
            .limit(1)
            .execute()
        )
        
        client_id = None
        if client_resp.data:
            client_id = client_resp.data[0].get("id")
        
        if not client_id:
            logger.info(f"No client found for email {submitter_email_norm}")
            return folder_ids
        
        # Find folders by client_id
        folder_rows = (
            supabase_storage
            .table("folders")
            .select("id")
            .eq("client_id", client_id)
            .execute()
        ).data or []
        
        candidate_folder_ids = [f.get("id") for f in folder_rows if f.get("id")]
        
        if not candidate_folder_ids:
            logger.info(f"No folders found for client {client_id}")
            return folder_ids
        
        # Filter to folders where form is assigned
        assignments = (
            supabase_storage
            .table("form_folder_assignments")
            .select("folder_id")
            .eq("form_id", form_id)
            .in_("folder_id", candidate_folder_ids)
            .execute()
        ).data or []
        
        folder_ids = [a.get("folder_id") for a in assignments if a.get("folder_id")]
        logger.info(f"Found {len(folder_ids)} folders for email {submitter_email_norm}, form {form_id}")
        
    except Exception as e:
        logger.error(f"Error finding folders by email: {str(e)}", exc_info=True)
    
    return folder_ids


def _find_all_assigned_folders(form_id: str) -> List[str]:
    """
    Find all folders where the form is assigned (last resort).
    
    Returns:
        List of folder IDs
    """
    try:
        assignments = (
            supabase_storage
            .table("form_folder_assignments")
            .select("folder_id")
            .eq("form_id", form_id)
            .execute()
        ).data or []
        
        folder_ids = [a.get("folder_id") for a in assignments if a.get("folder_id")]
        logger.info(f"Found {len(folder_ids)} total folders with form {form_id} assigned")
        return folder_ids
    except Exception as e:
        logger.error(f"Error finding all assigned folders: {str(e)}", exc_info=True)
        return []


@router.post("/typeform")
async def typeform_webhook(
    request: Request,
    typeform_signature: Optional[str] = Header(None, alias="typeform-signature")
):
    """
    Handle Typeform webhook events for form submissions.
    
    When a Typeform form is submitted, this endpoint:
    1. Extracts form ID, submitter email, and folder_id (if in hidden fields)
    2. Finds matching form in database by typeform_form_id
    3. Finds folders using:
       - Primary: folder_id from hidden fields
       - Fallback: Match submitter email to client email
       - Last resort: All folders where form is assigned
    4. Creates completion records for each matched folder
    """
    try:
        # Parse request body
        body = await request.body()
        try:
            payload = json.loads(body.decode('utf-8'))
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON payload: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid JSON payload")
        
        logger.info(f"Received Typeform webhook: event_type={payload.get('event_type')}, form_id={payload.get('form_response', {}).get('form_id')}")
        
        # Extract data from payload
        extracted = _extract_typeform_data(payload)
        typeform_form_id = extracted.get("typeform_form_id")
        submitter_email = extracted.get("submitter_email")
        folder_id_from_hidden = extracted.get("folder_id")
        
        if not typeform_form_id:
            logger.error("No form_id found in Typeform webhook payload")
            raise HTTPException(status_code=400, detail="Missing form_id in payload")
        
        # Find matching form in database
        form_response = (
            supabase_storage
            .table("forms")
            .select("id, name, typeform_form_id")
            .eq("typeform_form_id", typeform_form_id)
            .eq("is_typeform_form", True)
            .limit(1)
            .execute()
        )
        
        if not form_response.data:
            logger.warning(f"No form found with typeform_form_id={typeform_form_id}")
            # Return success to prevent Typeform from retrying
            return {
                "status": "success",
                "message": f"Form {typeform_form_id} not found in database (may not be imported)"
            }
        
        form = form_response.data[0]
        form_id = form.get("id")
        form_name = form.get("name", "Unknown Form")
        
        logger.info(f"Matched Typeform form {typeform_form_id} to internal form {form_id} ({form_name})")
        
        # Determine which folders to mark as complete
        folder_ids = []
        
        # Strategy 1: Use folder_id from hidden fields (primary)
        if folder_id_from_hidden:
            # Verify form is assigned to this folder
            assignment_check = (
                supabase_storage
                .table("form_folder_assignments")
                .select("id")
                .eq("form_id", form_id)
                .eq("folder_id", folder_id_from_hidden)
                .limit(1)
                .execute()
            ).data or []
            
            if assignment_check:
                folder_ids = [folder_id_from_hidden]
                logger.info(f"Using folder_id from hidden fields: {folder_id_from_hidden}")
            else:
                logger.warning(f"Form {form_id} is not assigned to folder {folder_id_from_hidden} from hidden fields")
        
        # Strategy 2: Match by email (fallback)
        if not folder_ids and submitter_email:
            folder_ids = _find_folders_by_email(submitter_email, form_id)
            if folder_ids:
                logger.info(f"Found {len(folder_ids)} folders by email matching")
        
        # Strategy 3: All assigned folders (last resort)
        if not folder_ids:
            folder_ids = _find_all_assigned_folders(form_id)
            if folder_ids:
                logger.warning(f"Using all assigned folders as last resort: {len(folder_ids)} folders")
        
        if not folder_ids:
            logger.warning(f"No folders found for form {form_id}. Submission will not be marked complete.")
            # Return success to prevent Typeform from retrying
            return {
                "status": "success",
                "message": f"No folders found for form {form_id}",
                "form_id": form_id,
                "form_name": form_name
            }
        
        # Create completion records for each folder
        results = []
        for folder_id in folder_ids:
            try:
                result = _create_form_completion_record(
                    form_id=form_id,
                    folder_id=folder_id,
                    submitter_email=submitter_email,
                    source="typeform_webhook"
                )
                results.append({
                    "folder_id": folder_id,
                    "success": result.get("success", False),
                    "submission_id": result.get("submission_id"),
                    "already_completed": result.get("already_completed", False)
                })
            except Exception as e:
                logger.error(f"Error creating completion record for folder {folder_id}: {str(e)}", exc_info=True)
                results.append({
                    "folder_id": folder_id,
                    "success": False,
                    "error": str(e)
                })
        
        success_count = sum(1 for r in results if r.get("success"))
        
        logger.info(
            f"Typeform webhook processed: form={form_name} ({form_id}), "
            f"folders={len(folder_ids)}, successful={success_count}/{len(folder_ids)}"
        )
        
        return {
            "status": "success",
            "form_id": form_id,
            "form_name": form_name,
            "folders_processed": len(folder_ids),
            "successful": success_count,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing Typeform webhook: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

