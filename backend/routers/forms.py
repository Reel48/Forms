from fastapi import APIRouter, HTTPException, Query, File, UploadFile, Depends, Request
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from decimal import Decimal
from io import BytesIO
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Form, FormCreate, FormUpdate, FormField, FormFieldCreate, FormFieldUpdate, FormSubmissionCreate, FormSubmission
from pydantic import ValidationError
from database import supabase, supabase_storage
from auth import get_current_user, get_current_admin, get_optional_user
from email_service import email_service
from email_utils import get_admin_emails
from webhook_service import webhook_service
import uuid
import secrets
import string
import hashlib
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/forms", tags=["forms"])

def generate_url_slug() -> str:
    """Generate a unique URL slug for forms"""
    while True:
        slug = 'form-' + ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
        # Check if slug exists
        existing = supabase_storage.table("forms").select("id").eq("public_url_slug", slug).execute()
        if not existing.data:
            return slug

# Email Template Management Endpoints (must come before /{form_id} route)
@router.post("/email-templates", response_model=dict)
async def create_email_template(
    template_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Create an email template (admin only)"""
    try:
        name = template_data.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Template name is required")
        
        template_type = template_data.get("template_type", "").strip()
        if not template_type:
            raise HTTPException(status_code=400, detail="Template type is required")
        
        subject = template_data.get("subject", "").strip()
        if not subject:
            raise HTTPException(status_code=400, detail="Email subject is required")
        
        html_body = template_data.get("html_body", "").strip()
        if not html_body:
            raise HTTPException(status_code=400, detail="HTML body is required")
        
        # If this is marked as default, unset other defaults of the same type
        is_default = template_data.get("is_default", False)
        if is_default:
            supabase_storage.table("email_templates").update({"is_default": False}).eq("template_type", template_type).execute()
        
        template_db_data = {
            "id": str(uuid.uuid4()),
            "name": name,
            "template_type": template_type,
            "subject": subject,
            "html_body": html_body,
            "text_body": template_data.get("text_body", "").strip() or None,
            "variables": template_data.get("variables", {}),
            "is_default": is_default,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        
        response = supabase_storage.table("email_templates").insert(template_db_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create template")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/email-templates", response_model=list)
async def get_email_templates(
    template_type: Optional[str] = Query(None),
    current_admin: dict = Depends(get_current_admin)
):
    """Get all email templates (admin only)"""
    try:
        query = supabase_storage.table("email_templates").select("*")
        
        if template_type:
            query = query.eq("template_type", template_type)
        
        # Execute query and sort in Python since Supabase client doesn't support chained order() calls
        response = query.execute()
        templates = response.data or []
        
        # Sort by: template_type (asc), then is_default (desc), then created_at (desc)
        # Python's sort is stable, so we sort by least important first, then more important
        templates.sort(key=lambda x: x.get("created_at", ""), reverse=True)  # Most recent first
        templates.sort(key=lambda x: not x.get("is_default", False), reverse=True)  # Defaults first
        templates.sort(key=lambda x: x.get("template_type", ""), reverse=False)  # Group by type
        
        return templates
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/email-templates/{template_id}", response_model=dict)
async def get_email_template(
    template_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get a specific email template (admin only)"""
    try:
        response = supabase_storage.table("email_templates").select("*").eq("id", template_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/email-templates/{template_id}", response_model=dict)
async def update_email_template(
    template_id: str,
    template_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Update an email template (admin only)"""
    try:
        # Verify template exists
        template_check = supabase_storage.table("email_templates").select("id, template_type").eq("id", template_id).single().execute()
        if not template_check.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        existing_template = template_check.data
        template_type = existing_template["template_type"]
        
        # Prepare update data
        update_data = {
            "updated_at": datetime.now().isoformat(),
        }
        
        if "name" in template_data:
            name = template_data["name"].strip()
            if not name:
                raise HTTPException(status_code=400, detail="Template name cannot be empty")
            update_data["name"] = name
        
        if "subject" in template_data:
            subject = template_data["subject"].strip()
            if not subject:
                raise HTTPException(status_code=400, detail="Email subject cannot be empty")
            update_data["subject"] = subject
        
        if "html_body" in template_data:
            html_body = template_data["html_body"].strip()
            if not html_body:
                raise HTTPException(status_code=400, detail="HTML body cannot be empty")
            update_data["html_body"] = html_body
        
        if "text_body" in template_data:
            update_data["text_body"] = template_data["text_body"].strip() or None
        
        if "variables" in template_data:
            update_data["variables"] = template_data["variables"]
        
        # Handle is_default flag
        if "is_default" in template_data:
            is_default = template_data["is_default"]
            if is_default:
                # Unset other defaults of the same type
                supabase_storage.table("email_templates").update({"is_default": False}).eq("template_type", template_type).neq("id", template_id).execute()
            update_data["is_default"] = is_default
        
        response = supabase_storage.table("email_templates").update(update_data).eq("id", template_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update template")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/email-templates/{template_id}")
async def delete_email_template(
    template_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete an email template (admin only)"""
    try:
        # Verify template exists
        template_check = supabase_storage.table("email_templates").select("id").eq("id", template_id).execute()
        if not template_check.data:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Delete template
        supabase_storage.table("email_templates").delete().eq("id", template_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/email-templates/types/{template_type}/variables", response_model=dict)
async def get_template_variables(
    template_type: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get available variables for a template type (admin only)"""
    try:
        from template_service import template_service
        variables = template_service.get_default_variables(template_type)
        return {"template_type": template_type, "variables": variables}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[Form])
async def get_forms(
    status: Optional[str] = Query(None, description="Filter by status (draft, published, archived)"),
    search: Optional[str] = Query(None, description="Search by name or description"),
    folder_id: Optional[str] = Query(None, description="Filter by folder ID"),
    templates_only: bool = Query(True, description="Show only templates (for template library)"),
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get all forms with optional filtering.
    - If templates_only=True (default): Shows only reusable templates (template library)
    - If folder_id provided: Shows all forms in folder (templates + instances)
    - Admins see all forms. Customers see only assigned forms.
    """
    try:
        # Use service role client to bypass RLS
        query = supabase_storage.table("forms").select("*, form_fields(*)")
        
        # Apply folder filter
        if folder_id:
            # When viewing folder content, show all forms (templates + instances)
            query = query.eq("folder_id", folder_id)
        elif templates_only:
            # For template library (main page), show only templates
            query = query.eq("is_template", True)
        
        # Check if user is admin
        is_admin = False
        if current_user:
            try:
                user_role_response = supabase_storage.table("user_roles").select("role").eq("user_id", current_user["id"]).single().execute()
                is_admin = user_role_response.data and user_role_response.data.get("role") == "admin"
            except Exception:
                is_admin = False
        
        # If not admin (customer), filter by access
        if current_user and not is_admin:
            if templates_only:
                # For template library, show all templates the customer created (regardless of folder assignments)
                query = query.eq("created_by", current_user["id"])
            else:
                # For regular form list, only show forms in folders they have access to
                # Get folders assigned to user
                folder_assignments_response = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", current_user["id"]).execute()
                accessible_folder_ids = [fa["folder_id"] for fa in (folder_assignments_response.data or [])]
                
                if not accessible_folder_ids:
                    return []  # No accessible folders
                
                # Get forms assigned to these folders
                form_assignments_response = supabase_storage.table("form_folder_assignments").select("form_id").in_("folder_id", accessible_folder_ids).execute()
                assigned_form_ids = [fa["form_id"] for fa in (form_assignments_response.data or [])]
                
                if not assigned_form_ids:
                    return []  # No assigned forms
                
                query = query.in_("id", assigned_form_ids)
        # Admins see all templates when templates_only=True (no additional filtering needed)
        
        # Apply status filter
        if status:
            valid_statuses = {"draft", "published", "archived"}
            if status not in valid_statuses:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}"
                )
            query = query.eq("status", status)
        
        # Apply search filter
        if search:
            # Search in name and description
            query = query.or_(f"name.ilike.%{search}%,description.ilike.%{search}%")
        
        # Order by created_at descending
        query = query.order("created_at", desc=True)
        
        response = query.execute()
        forms = response.data
        
        # Sort fields by order_index and map form_fields to fields
        for form in forms:
            fields = form.get("form_fields", [])
            if fields:
                fields = sorted(fields, key=lambda x: x.get("order_index", 0))
            form["fields"] = fields
            if "form_fields" in form:
                del form["form_fields"]
        
        return forms
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/public/{slug}", response_model=Form)
async def get_form_by_slug(slug: str):
    """Get a form by public URL slug (for public access)"""
    try:
        from datetime import datetime
        
        response = supabase_storage.table("forms").select("*, form_fields(*)").eq("public_url_slug", slug).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = response.data
        
        # Check if form is published
        if form.get("status") != "published":
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Check scheduling dates
        settings = form.get("settings") or {}
        now = datetime.utcnow()
        
        # Check publish_date - form should not be accessible before publish_date
        if settings.get("publish_date"):
            try:
                publish_date = datetime.fromisoformat(settings["publish_date"].replace("Z", "+00:00"))
                if now < publish_date.replace(tzinfo=None):
                    raise HTTPException(status_code=404, detail="Form not yet published")
            except (ValueError, TypeError):
                pass  # Invalid date format, ignore
        
        # Check unpublish_date - form should not be accessible after unpublish_date
        if settings.get("unpublish_date"):
            try:
                unpublish_date = datetime.fromisoformat(settings["unpublish_date"].replace("Z", "+00:00"))
                if now > unpublish_date.replace(tzinfo=None):
                    raise HTTPException(status_code=404, detail="Form is no longer available")
            except (ValueError, TypeError):
                pass  # Invalid date format, ignore
        
        # Check expiration date
        if settings.get("expiration_date"):
            try:
                expiration_date = datetime.fromisoformat(settings["expiration_date"].replace("Z", "+00:00"))
                if now > expiration_date.replace(tzinfo=None):
                    raise HTTPException(status_code=404, detail="This form has expired and is no longer accepting submissions")
            except (ValueError, TypeError):
                pass  # Invalid date format, ignore
        
        # Check response limits
        if settings.get("max_submissions"):
            try:
                max_submissions = int(settings["max_submissions"])
                # Count completed submissions
                count_response = supabase_storage.table("form_submissions").select("id", count="exact").eq("form_id", form.get("id")).eq("status", "completed").execute()
                current_count = count_response.count if hasattr(count_response, 'count') else len(count_response.data or [])
                
                if current_count >= max_submissions:
                    raise HTTPException(status_code=404, detail=f"This form has reached its maximum submission limit of {max_submissions}")
            except (ValueError, TypeError):
                pass  # Invalid max_submissions value, ignore
        
        # Sort fields by order_index and map form_fields to fields
        fields = form.get("form_fields", [])
        if fields:
            fields = sorted(fields, key=lambda x: x.get("order_index", 0))
        
        form["fields"] = fields
        if "form_fields" in form:
            del form["form_fields"]
        
        # Don't return password in public endpoint (security)
        if "settings" in form and form["settings"]:
            settings = form["settings"].copy() if isinstance(form["settings"], dict) else {}
            if "password" in settings:
                # Indicate password is required but don't return the actual password
                settings["password_required"] = True
                del settings["password"]
            form["settings"] = settings
        
        return form
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}", response_model=Form)
async def get_form(form_id: str, current_user: Optional[dict] = Depends(get_optional_user)):
    """Get a single form by ID with all fields.
    Admins can see any form. Customers can only see assigned forms.
    """
    try:
        response = supabase_storage.table("forms").select("*, form_fields(*)").eq("id", form_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = response.data
        
        # If customer, verify they have access through folder assignments
        if current_user and current_user.get("role") == "customer":
            # Get folders assigned to user
            folder_assignments_response = supabase_storage.table("folder_assignments").select("folder_id").eq("user_id", current_user["id"]).execute()
            accessible_folder_ids = [fa["folder_id"] for fa in (folder_assignments_response.data or [])]
            
            if not accessible_folder_ids:
                raise HTTPException(status_code=403, detail="You don't have access to this form")
            
            # Check if form is in any accessible folder
            form_assignments_response = supabase_storage.table("form_folder_assignments").select("id").eq("form_id", form_id).in_("folder_id", accessible_folder_ids).execute()
            has_access = bool(form_assignments_response.data)
            
            if not has_access:
                raise HTTPException(status_code=403, detail="You don't have access to this form")
        
        # Sort fields by order_index and map form_fields to fields for Pydantic model
        fields = form.get("form_fields", [])
        if fields:
            fields = sorted(fields, key=lambda x: x.get("order_index", 0))
        
        # Map form_fields to fields for the Pydantic model
        form["fields"] = fields
        # Remove form_fields to avoid confusion
        if "form_fields" in form:
            del form["form_fields"]
        
        return form
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=Form)
async def create_form(form: FormCreate, current_admin: dict = Depends(get_current_admin)):
    """Create a new form with fields (admin only)"""
    try:
        # Log incoming request for debugging
        print(f"Creating form: {form.name}")
        print(f"Form type: {type(form)}")
        print(f"Form has fields attribute: {hasattr(form, 'fields')}")
        
        # Safely get fields - should always exist on FormCreate
        # Use getattr with default to handle any edge cases
        fields = getattr(form, 'fields', None)
        if fields is None:
            print("WARNING: fields attribute is None, using empty list")
            fields = []
        elif not isinstance(fields, list):
            print(f"WARNING: fields is not a list, type: {type(fields)}, converting...")
            fields = list(fields) if fields else []
        
        print(f"Fields received: {len(fields) if fields else 0}")
        if fields:
            # Check if fields are dicts and convert them to FormFieldCreate objects
            parsed_fields = []
            for idx, field in enumerate(fields):
                if isinstance(field, dict):
                    print(f"  Field {idx} is a dict, converting to FormFieldCreate...")
                    try:
                        parsed_fields.append(FormFieldCreate(**field))
                    except ValidationError as field_error:
                        print(f"  ERROR converting field {idx}: {str(field_error)}")
                        raise HTTPException(status_code=400, detail=f"Invalid field data at index {idx}: {str(field_error)}")
                    except Exception as field_error:
                        print(f"  ERROR converting field {idx}: {str(field_error)}")
                        raise HTTPException(status_code=400, detail=f"Invalid field data at index {idx}: {str(field_error)}")
                elif isinstance(field, FormFieldCreate):
                    parsed_fields.append(field)
                else:
                    print(f"  WARNING: Field {idx} has unexpected type: {type(field)}, attempting to use as-is")
                    parsed_fields.append(field)
            fields = parsed_fields
            print(f"Fields data: {[{'type': getattr(f, 'field_type', 'unknown'), 'label': getattr(f, 'label', 'no label')} for f in fields]}")
        
        # Generate form data
        form_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        # Generate public URL slug if not provided
        public_url_slug = form.public_url_slug or generate_url_slug()
        
        # Get theme and other dict fields (should always exist on FormCreate)
        theme = form.theme if form.theme else {}
        settings = form.settings if form.settings else {}
        welcome_screen = form.welcome_screen if form.welcome_screen else {}
        thank_you_screen = form.thank_you_screen if form.thank_you_screen else {}
        
        # Prepare form data
        # Note: created_by is not in the forms table schema, so we exclude it
        form_data = {
            "id": form_id,
            "name": form.name,
            "description": form.description,
            "status": form.status,
            "public_url_slug": public_url_slug,
            "theme": theme,
            "settings": settings,
            "welcome_screen": welcome_screen,
            "thank_you_screen": thank_you_screen,
            "is_template": getattr(form, 'is_template', True),  # New forms are templates by default
            "created_at": now,
            "updated_at": now
        }
        
        # Create form - use service role client to bypass RLS
        form_response = supabase_storage.table("forms").insert(form_data).execute()
        
        if not form_response.data:
            raise HTTPException(status_code=500, detail="Failed to create form")
        
        created_form = form_response.data[0]
        print(f"Form created with ID: {form_id}")
        
        # Create fields if provided
        if fields and len(fields) > 0:
            print(f"Processing {len(fields)} fields...")
            fields_data = []
            for idx, field in enumerate(fields):
                try:
                    # Safely access field attributes using getattr
                    field_type = getattr(field, 'field_type', 'text')
                    field_label = getattr(field, 'label', '')
                    field_description = getattr(field, 'description', None)
                    field_placeholder = getattr(field, 'placeholder', None)
                    field_required = getattr(field, 'required', False)
                    field_validation_rules = getattr(field, 'validation_rules', None) or {}
                    field_options = getattr(field, 'options', None) or []
                    field_order_index = getattr(field, 'order_index', None)
                    field_conditional_logic = getattr(field, 'conditional_logic', None) or {}
                    
                    # Use idx if order_index is 0 or not set, otherwise use the provided order_index
                    order_idx = field_order_index if field_order_index is not None and field_order_index >= 0 else idx
                    
                    field_data = {
                        "id": str(uuid.uuid4()),
                        "form_id": form_id,
                        "field_type": field_type,
                        "label": field_label or "",  # Allow empty labels for draft fields
                        "description": field_description,
                        "placeholder": field_placeholder,
                        "required": field_required,
                        "validation_rules": field_validation_rules,
                        "options": field_options,
                        "order_index": order_idx,
                        "conditional_logic": field_conditional_logic,
                        "created_at": now
                    }
                    fields_data.append(field_data)
                    print(f"  Field {idx}: {field_type} - {field_label or '(no label)'}")
                except Exception as field_process_error:
                    print(f"  ERROR processing field {idx}: {str(field_process_error)}")
                    print(f"  Field object: {field}")
                    print(f"  Field type: {type(field)}")
                    import traceback
                    traceback.print_exc()
                    raise HTTPException(status_code=400, detail=f"Error processing field at index {idx}: {str(field_process_error)}")
            
            if fields_data:
                print(f"Inserting {len(fields_data)} fields into database...")
                try:
                    # Use service role client to bypass RLS
                    fields_response = supabase_storage.table("form_fields").insert(fields_data).execute()
                    if fields_response.data:
                        print(f"Successfully inserted {len(fields_response.data)} fields")
                    else:
                        print(f"ERROR: Failed to insert fields for form {form_id}")
                        print(f"Fields data: {fields_data}")
                        # Raise error instead of silently failing
                        raise HTTPException(status_code=500, detail=f"Failed to insert {len(fields_data)} fields")
                except Exception as field_error:
                    print(f"ERROR inserting fields: {str(field_error)}")
                    print(f"Fields data: {fields_data}")
                    raise HTTPException(status_code=500, detail=f"Failed to insert fields: {str(field_error)}")
        else:
            print("No fields provided or fields list is empty")
        
        # Fetch the complete form with fields using service role client
        # Don't call get_form directly as it uses anon key - fetch directly instead
        form_response = supabase_storage.table("forms").select("*, form_fields(*)").eq("id", form_id).single().execute()
        
        if not form_response.data:
            raise HTTPException(status_code=500, detail="Failed to retrieve created form")
        
        form = form_response.data
        
        # Sort fields by order_index and map form_fields to fields for Pydantic model
        fields = form.get("form_fields", [])
        if fields:
            fields = sorted(fields, key=lambda x: x.get("order_index", 0))
        
        # Map form_fields to fields for the Pydantic model
        form["fields"] = fields
        # Remove form_fields to avoid confusion
        if "form_fields" in form:
            del form["form_fields"]
        
        print(f"Returning form with {len(fields)} fields")
        return form
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in create_form: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}", response_model=Form)
async def update_form(form_id: str, form_update: FormUpdate, current_admin: dict = Depends(get_current_admin)):
    """Update a form (admin only)"""
    try:
        # Check if form exists
        existing = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Prepare update data (only include provided fields)
        update_data = {}
        if form_update.name is not None:
            update_data["name"] = form_update.name
        if form_update.description is not None:
            update_data["description"] = form_update.description
        if form_update.status is not None:
            update_data["status"] = form_update.status
        if form_update.theme is not None:
            update_data["theme"] = form_update.theme
        if form_update.settings is not None:
            update_data["settings"] = form_update.settings
        if form_update.welcome_screen is not None:
            update_data["welcome_screen"] = form_update.welcome_screen
        if form_update.thank_you_screen is not None:
            update_data["thank_you_screen"] = form_update.thank_you_screen
        
        update_data["updated_at"] = datetime.now().isoformat()
        
        # Update form
        supabase_storage.table("forms").update(update_data).eq("id", form_id).execute()
        
        # Return updated form
        # Pass current_admin as current_user since we're calling from within update_form
        return await get_form(form_id, current_admin)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{form_id}")
async def delete_form(form_id: str, current_admin: dict = Depends(get_current_admin)):
    """Delete a form and all its fields (admin only)"""
    try:
        # Check if form exists
        existing = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Delete form (cascade will delete fields, submissions, and answers)
        supabase_storage.table("forms").delete().eq("id", form_id).execute()
        
        return {"message": "Form deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Field management endpoints
@router.post("/{form_id}/fields", response_model=FormField)
async def create_field(form_id: str, field: FormFieldCreate, current_admin: dict = Depends(get_current_admin)):
    """Add a field to a form (admin only)"""
    try:
        # Check if form exists
        existing = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Get current max order_index
        fields_response = supabase_storage.table("form_fields").select("order_index").eq("form_id", form_id).order("order_index", desc=True).limit(1).execute()
        max_order = fields_response.data[0]["order_index"] if fields_response.data else -1
        
        # Create field
        field_data = {
            "id": str(uuid.uuid4()),
            "form_id": form_id,
            "field_type": field.field_type,
            "label": field.label,
            "description": field.description,
            "placeholder": field.placeholder,
            "required": field.required,
            "validation_rules": field.validation_rules or {},
            "options": field.options or [],
            "order_index": field.order_index if field.order_index > 0 else max_order + 1,
            "conditional_logic": field.conditional_logic or {},
            "created_at": datetime.now().isoformat()
        }
        
        response = supabase_storage.table("form_fields").insert(field_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create field")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}/fields/{field_id}", response_model=FormField)
async def update_field(form_id: str, field_id: str, field_update: FormFieldUpdate, current_admin: dict = Depends(get_current_admin)):
    """Update a form field (admin only)"""
    try:
        # Check if field exists and belongs to form
        existing = supabase_storage.table("form_fields").select("id").eq("id", field_id).eq("form_id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Field not found")
        
        # Prepare update data (only include provided fields)
        update_data = field_update.model_dump(exclude_unset=True)
        
        # Update field
        response = supabase_storage.table("form_fields").update(update_data).eq("id", field_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update field")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{form_id}/fields/{field_id}")
async def delete_field(form_id: str, field_id: str, current_admin: dict = Depends(get_current_admin)):
    """Delete a form field (admin only)"""
    try:
        # Check if field exists and belongs to form
        existing = supabase_storage.table("form_fields").select("id").eq("id", field_id).eq("form_id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Field not found")
        
        # Delete field
        supabase_storage.table("form_fields").delete().eq("id", field_id).execute()
        
        return {"message": "Field deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}/fields/reorder")
async def reorder_fields(form_id: str, field_orders: List[dict], current_admin: dict = Depends(get_current_admin)):
    """Reorder form fields (admin only)"""
    try:
        # Check if form exists
        existing = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Update order_index for each field
        for field_order in field_orders:
            field_id = field_order.get("field_id")
            order_index = field_order.get("order_index")
            
            if field_id and order_index is not None:
                supabase_storage.table("form_fields").update({"order_index": order_index}).eq("id", field_id).eq("form_id", form_id).execute()
        
        return {"message": "Fields reordered successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Form Submission endpoints
@router.get("/{form_id}/submissions", response_model=List[FormSubmission])
async def get_form_submissions(form_id: str, current_admin: dict = Depends(get_current_admin)):
    """Get all submissions for a form (admin only)"""
    try:
        # Check if form exists
        form_response = supabase_storage.table("forms").select("id").eq("id", form_id).single().execute()
        
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Fetch submissions with answers
        response = supabase_storage.table("form_submissions").select("*, form_submission_answers(*)").eq("form_id", form_id).order("submitted_at", desc=True).execute()
        
        submissions = response.data or []
        
        # Map form_submission_answers to answers for each submission
        for submission in submissions:
            answers = submission.get("form_submission_answers", [])
            submission["answers"] = answers
            # Remove form_submission_answers to avoid confusion
            if "form_submission_answers" in submission:
                del submission["form_submission_answers"]
        
        return submissions
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/submissions/{submission_id}", response_model=FormSubmission)
async def get_form_submission(form_id: str, submission_id: str):
    """Get a single submission by ID"""
    try:
        # Check if form exists
        form_response = supabase.table("forms").select("id").eq("id", form_id).single().execute()
        
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Fetch submission with answers
        response = supabase.table("form_submissions").select("*, form_submission_answers(*)").eq("id", submission_id).eq("form_id", form_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        submission = response.data
        
        # Map form_submission_answers to answers for Pydantic model
        answers = submission.get("form_submission_answers", [])
        submission["answers"] = answers
        # Remove form_submission_answers to avoid confusion
        if "form_submission_answers" in submission:
            del submission["form_submission_answers"]
        
        return submission
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{form_id}/short-url", response_model=dict)
async def create_short_url(form_id: str, request: Request, current_admin: dict = Depends(get_current_admin)):
    """Create a short URL for a form (admin only)"""
    try:
        import random
        
        # Verify form exists
        form_check = supabase_storage.table("forms").select("id, public_url_slug").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = form_check.data[0]
        if not form.get("public_url_slug"):
            raise HTTPException(status_code=400, detail="Form must have a public URL slug to create a short URL")
        
        # Generate a unique short code (6 characters)
        def generate_short_code():
            chars = string.ascii_letters + string.digits
            return ''.join(secrets.choice(chars) for _ in range(6))
        
        # Try to generate a unique code (max 10 attempts)
        short_code = None
        for _ in range(10):
            code = generate_short_code()
            existing = supabase_storage.table("form_short_urls").select("id").eq("short_code", code).execute()
            if not existing.data:
                short_code = code
                break
        
        if not short_code:
            raise HTTPException(status_code=500, detail="Failed to generate unique short code")
        
        # Create short URL record
        short_url_data = {
            "id": str(uuid.uuid4()),
            "form_id": form_id,
            "short_code": short_code,
            "click_count": 0,
            "created_at": datetime.now().isoformat(),
        }
        
        response = supabase_storage.table("form_short_urls").insert(short_url_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create short URL")
        
        base_url = str(request.base_url).rstrip('/')
        return {
            "short_code": short_code,
            "short_url": f"/api/forms/short/{short_code}",
            "full_url": f"{base_url}/api/forms/short/{short_code}",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/short-url/{short_code}", response_model=dict)
async def get_short_url_info(short_code: str):
    """Get information about a short URL (public)"""
    try:
        response = supabase.table("form_short_urls").select("*, forms(id, name, public_url_slug)").eq("short_code", short_code).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Short URL not found")
        
        short_url = response.data
        form = short_url.get("forms")
        
        if not form or not form.get("public_url_slug"):
            raise HTTPException(status_code=404, detail="Form not found")
        
        return {
            "short_code": short_code,
            "form_id": short_url["form_id"],
            "form_slug": form["public_url_slug"],
            "redirect_url": f"/public/form/{form['public_url_slug']}",
            "click_count": short_url.get("click_count", 0),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/short/{short_code}")
async def redirect_short_url(short_code: str):
    """Redirect short URL to the actual form (public endpoint)"""
    try:
        from fastapi.responses import RedirectResponse
        
        # Get short URL info
        response = supabase.table("form_short_urls").select("*, forms(public_url_slug)").eq("short_code", short_code).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Short URL not found")
        
        short_url = response.data
        form = short_url.get("forms")
        
        if not form or not form.get("public_url_slug"):
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Increment click count
        current_count = short_url.get("click_count", 0)
        supabase.table("form_short_urls").update({"click_count": current_count + 1}).eq("id", short_url["id"]).execute()
        
        # Redirect to the form
        redirect_url = f"/public/form/{form['public_url_slug']}"
        return RedirectResponse(url=redirect_url, status_code=302)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/short-urls", response_model=list)
async def get_form_short_urls(form_id: str, current_admin: dict = Depends(get_current_admin)):
    """Get all short URLs for a form (admin only)"""
    try:
        response = supabase_storage.table("form_short_urls").select("*").eq("form_id", form_id).order("created_at", desc=True).execute()
        
        return response.data or []
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/submissions/export-pdf")
async def export_submissions_pdf(form_id: str, current_admin: dict = Depends(get_current_admin)):
    """Export form submissions as PDF (admin only)"""
    try:
        from fastapi.responses import Response
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        
        # Get form and submissions
        form_response = supabase_storage.table("forms").select("*").eq("id", form_id).single().execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = form_response.data
        
        submissions_response = supabase_storage.table("form_submissions").select("*, form_submission_answers(*)").eq("form_id", form_id).order("submitted_at", desc=True).execute()
        submissions = submissions_response.data or []
        
        if not submissions:
            raise HTTPException(status_code=400, detail="No submissions to export")
        
        # Create PDF buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch,
            title=f"{form.get('name', 'Form')} - Submissions"
        )
        
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=12,
        )
        elements.append(Paragraph(form.get('name', 'Form Submissions'), title_style))
        elements.append(Paragraph(f"Total Submissions: {len(submissions)}", styles['Normal']))
        elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
        elements.append(Spacer(1, 0.3*inch))
        
        # Process each submission
        for idx, submission in enumerate(submissions):
            if idx > 0:
                elements.append(PageBreak())
            
            # Submission header
            header_style = ParagraphStyle(
                'SubmissionHeader',
                parent=styles['Heading2'],
                fontSize=14,
                textColor=colors.HexColor('#333333'),
                spaceAfter=8,
            )
            elements.append(Paragraph(f"Submission #{idx + 1}", header_style))
            
            # Submission metadata
            metadata_data = [
                ['Field', 'Value'],
                ['Submission ID', submission.get('id', 'N/A')],
                ['Submitted At', submission.get('submitted_at', 'N/A')],
                ['Started At', submission.get('started_at', 'N/A') or 'N/A'],
                ['Submitter Name', submission.get('submitter_name', 'N/A') or 'N/A'],
                ['Submitter Email', submission.get('submitter_email', 'N/A') or 'N/A'],
                ['Time Spent', f"{submission.get('time_spent_seconds', 0) or 0} seconds"],
                ['Status', submission.get('status', 'N/A')],
                ['Review Status', submission.get('review_status', 'new') or 'new'],
            ]
            
            metadata_table = Table(metadata_data, colWidths=[2*inch, 4*inch])
            metadata_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
            ]))
            elements.append(metadata_table)
            elements.append(Spacer(1, 0.2*inch))
            
            # Get form fields for reference
            fields_response = supabase_storage.table("form_fields").select("*").eq("form_id", form_id).order("order_index").execute()
            fields = {f['id']: f for f in (fields_response.data or [])}
            
            # Answers
            answers = submission.get('form_submission_answers', [])
            if answers:
                elements.append(Paragraph("Responses:", styles['Heading3']))
                
                answers_data = [['Field', 'Answer']]
                for answer in answers:
                    field_id = answer.get('field_id')
                    field = fields.get(field_id, {})
                    field_label = field.get('label', f"Field {field_id[:8]}...") if field_id else 'Unknown Field'
                    
                    answer_text = answer.get('answer_text', '')
                    if not answer_text and answer.get('answer_value'):
                        answer_value = answer.get('answer_value', {})
                        if isinstance(answer_value, dict) and answer_value.get('value'):
                            answer_text = str(answer_value['value'])
                        else:
                            answer_text = str(answer_value)
                    
                    if not answer_text:
                        answer_text = 'N/A'
                    
                    # Truncate long answers for table display
                    if len(answer_text) > 100:
                        answer_text = answer_text[:100] + '...'
                    
                    answers_data.append([field_label, answer_text])
                
                answers_table = Table(answers_data, colWidths=[2.5*inch, 3.5*inch])
                answers_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                elements.append(answers_table)
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return Response(
            content=buffer.read(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{form.get("name", "submissions").replace(" ", "_")}_submissions_{datetime.now().strftime("%Y%m%d")}.pdf"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/submissions/{submission_id}/notes", response_model=list)
async def get_submission_notes(
    form_id: str,
    submission_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get all notes for a submission (admin only)"""
    try:
        # Verify form and submission exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Get notes
        response = supabase_storage.table("form_submission_notes").select("*").eq("submission_id", submission_id).order("created_at", desc=True).execute()
        
        return response.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{form_id}/submissions/{submission_id}/notes", response_model=dict)
async def create_submission_note(
    form_id: str,
    submission_id: str,
    note_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Create a note for a submission (admin only)"""
    try:
        # Verify form and submission exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        note_text = note_data.get("note_text", "").strip()
        if not note_text:
            raise HTTPException(status_code=400, detail="Note text is required")
        
        # Create note
        note_data_db = {
            "id": str(uuid.uuid4()),
            "submission_id": submission_id,
            "user_id": current_admin.get("sub"),
            "note_text": note_text,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        
        response = supabase_storage.table("form_submission_notes").insert(note_data_db).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create note")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}/submissions/{submission_id}/notes/{note_id}", response_model=dict)
async def update_submission_note(
    form_id: str,
    submission_id: str,
    note_id: str,
    note_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Update a submission note (admin only)"""
    try:
        # Verify form and submission exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Verify note exists and belongs to submission
        note_check = supabase_storage.table("form_submission_notes").select("id").eq("id", note_id).eq("submission_id", submission_id).execute()
        if not note_check.data:
            raise HTTPException(status_code=404, detail="Note not found")
        
        note_text = note_data.get("note_text", "").strip()
        if not note_text:
            raise HTTPException(status_code=400, detail="Note text is required")
        
        # Update note
        response = supabase_storage.table("form_submission_notes").update({
            "note_text": note_text,
            "updated_at": datetime.now().isoformat(),
        }).eq("id", note_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update note")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{form_id}/submissions/{submission_id}/notes/{note_id}")
async def delete_submission_note(
    form_id: str,
    submission_id: str,
    note_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete a submission note (admin only)"""
    try:
        # Verify form and submission exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Verify note exists and belongs to submission
        note_check = supabase_storage.table("form_submission_notes").select("id").eq("id", note_id).eq("submission_id", submission_id).execute()
        if not note_check.data:
            raise HTTPException(status_code=404, detail="Note not found")
        
        # Delete note
        supabase_storage.table("form_submission_notes").delete().eq("id", note_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Webhook Management Endpoints
@router.post("/{form_id}/webhooks", response_model=dict)
async def create_webhook(
    form_id: str,
    webhook_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Create a webhook for a form (admin only)"""
    try:
        # Verify form exists
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        url = webhook_data.get("url", "").strip()
        if not url:
            raise HTTPException(status_code=400, detail="Webhook URL is required")
        
        # Validate URL format
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Webhook URL must start with http:// or https://")
        
        events = webhook_data.get("events", ["submission.created"])
        if not isinstance(events, list) or len(events) == 0:
            events = ["submission.created"]
        
        # Create webhook
        webhook_db_data = {
            "id": str(uuid.uuid4()),
            "form_id": form_id,
            "url": url,
            "secret": webhook_data.get("secret", "").strip() or None,
            "events": events,
            "is_active": webhook_data.get("is_active", True),
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        
        response = supabase_storage.table("form_webhooks").insert(webhook_db_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create webhook")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/webhooks", response_model=list)
async def get_form_webhooks(
    form_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get all webhooks for a form (admin only)"""
    try:
        # Verify form exists
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        response = supabase_storage.table("form_webhooks").select("*").eq("form_id", form_id).order("created_at", desc=True).execute()
        
        # Don't return secret in response
        webhooks = response.data or []
        for webhook in webhooks:
            if "secret" in webhook:
                webhook["secret"] = "***" if webhook.get("secret") else None
        
        return webhooks
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}/webhooks/{webhook_id}", response_model=dict)
async def update_webhook(
    form_id: str,
    webhook_id: str,
    webhook_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Update a webhook (admin only)"""
    try:
        # Verify form and webhook exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        webhook_check = supabase_storage.table("form_webhooks").select("id").eq("id", webhook_id).eq("form_id", form_id).execute()
        if not webhook_check.data:
            raise HTTPException(status_code=404, detail="Webhook not found")
        
        # Prepare update data
        update_data = {
            "updated_at": datetime.now().isoformat(),
        }
        
        if "url" in webhook_data:
            url = webhook_data["url"].strip()
            if not url:
                raise HTTPException(status_code=400, detail="Webhook URL cannot be empty")
            if not url.startswith(("http://", "https://")):
                raise HTTPException(status_code=400, detail="Webhook URL must start with http:// or https://")
            update_data["url"] = url
        
        if "events" in webhook_data:
            events = webhook_data["events"]
            if isinstance(events, list) and len(events) > 0:
                update_data["events"] = events
        
        if "is_active" in webhook_data:
            update_data["is_active"] = bool(webhook_data["is_active"])
        
        if "secret" in webhook_data:
            secret = webhook_data["secret"].strip()
            # Only update if new secret provided (not masked)
            if secret and secret != "***":
                update_data["secret"] = secret if secret else None
        
        response = supabase_storage.table("form_webhooks").update(update_data).eq("id", webhook_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update webhook")
        
        webhook = response.data[0]
        if "secret" in webhook:
            webhook["secret"] = "***" if webhook.get("secret") else None
        
        return webhook
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{form_id}/webhooks/{webhook_id}")
async def delete_webhook(
    form_id: str,
    webhook_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete a webhook (admin only)"""
    try:
        # Verify form and webhook exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        webhook_check = supabase_storage.table("form_webhooks").select("id").eq("id", webhook_id).eq("form_id", form_id).execute()
        if not webhook_check.data:
            raise HTTPException(status_code=404, detail="Webhook not found")
        
        # Delete webhook
        supabase_storage.table("form_webhooks").delete().eq("id", webhook_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/webhooks/{webhook_id}/deliveries", response_model=list)
async def get_webhook_deliveries(
    form_id: str,
    webhook_id: str,
    current_admin: dict = Depends(get_current_admin),
    limit: int = Query(50, ge=1, le=100)
):
    """Get delivery history for a webhook (admin only)"""
    try:
        # Verify form and webhook exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        webhook_check = supabase_storage.table("form_webhooks").select("id").eq("id", webhook_id).eq("form_id", form_id).execute()
        if not webhook_check.data:
            raise HTTPException(status_code=404, detail="Webhook not found")
        
        response = supabase_storage.table("form_webhook_deliveries").select("*").eq("webhook_id", webhook_id).order("created_at", desc=True).limit(limit).execute()
        
        return response.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Password Protection Endpoint
@router.post("/public/{slug}/verify-password")
async def verify_form_password(slug: str, password_data: dict):
    """Verify password for a password-protected form (public endpoint)"""
    try:
        # Get form
        response = supabase.table("forms").select("id, settings").eq("public_url_slug", slug).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = response.data
        settings = form.get("settings") or {}
        form_password = settings.get("password")
        
        if not form_password:
            # Form doesn't have password protection
            return {"success": True, "message": "Form does not require password"}
        
        # Verify password
        provided_password = password_data.get("password", "").strip()
        if provided_password == form_password:
            return {"success": True, "message": "Password correct"}
        else:
            raise HTTPException(status_code=401, detail="Incorrect password")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Submission Tags Endpoints
@router.post("/{form_id}/submissions/{submission_id}/tags", response_model=dict)
async def add_submission_tag(
    form_id: str,
    submission_id: str,
    tag_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Add a tag to a submission (admin only)"""
    try:
        # Verify form and submission exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        tag_name = tag_data.get("tag_name", "").strip()
        if not tag_name:
            raise HTTPException(status_code=400, detail="Tag name is required")
        
        if len(tag_name) > 50:
            raise HTTPException(status_code=400, detail="Tag name must be 50 characters or less")
        
        color = tag_data.get("color", "#667eea").strip()
        if not color.startswith("#") or len(color) != 7:
            color = "#667eea"
        
        # Create tag
        tag_db_data = {
            "id": str(uuid.uuid4()),
            "submission_id": submission_id,
            "tag_name": tag_name,
            "color": color,
            "created_at": datetime.now().isoformat(),
        }
        
        try:
            response = supabase_storage.table("form_submission_tags").insert(tag_db_data).execute()
            return response.data[0] if response.data else tag_db_data
        except Exception as e:
            # Check if it's a duplicate
            if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                raise HTTPException(status_code=400, detail="Tag already exists on this submission")
            raise
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/submissions/{submission_id}/tags", response_model=list)
async def get_submission_tags(
    form_id: str,
    submission_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get all tags for a submission (admin only)"""
    try:
        # Verify form and submission exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        response = supabase_storage.table("form_submission_tags").select("*").eq("submission_id", submission_id).order("created_at", desc=True).execute()
        
        return response.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{form_id}/submissions/{submission_id}/tags/{tag_id}")
async def delete_submission_tag(
    form_id: str,
    submission_id: str,
    tag_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete a tag from a submission (admin only)"""
    try:
        # Verify form and submission exist
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Verify tag exists and belongs to submission
        tag_check = supabase_storage.table("form_submission_tags").select("id").eq("id", tag_id).eq("submission_id", submission_id).execute()
        if not tag_check.data:
            raise HTTPException(status_code=404, detail="Tag not found")
        
        # Delete tag
        supabase_storage.table("form_submission_tags").delete().eq("id", tag_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/submissions/tags/all", response_model=list)
async def get_all_submission_tags(
    form_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get all unique tags used in a form's submissions (admin only)"""
    try:
        # Verify form exists
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Get all submissions for this form
        submissions_response = supabase_storage.table("form_submissions").select("id").eq("form_id", form_id).execute()
        submission_ids = [s["id"] for s in (submissions_response.data or [])]
        
        if not submission_ids:
            return []
        
        # Get all tags for these submissions
        response = supabase_storage.table("form_submission_tags").select("tag_name, color").in_("submission_id", submission_ids).execute()
        
        # Get unique tags
        unique_tags = {}
        for tag in (response.data or []):
            tag_name = tag["tag_name"]
            if tag_name not in unique_tags:
                unique_tags[tag_name] = tag["color"]
        
        return [{"tag_name": name, "color": color} for name, color in unique_tags.items()]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Field Library Endpoints
@router.post("/field-library", response_model=dict)
async def save_field_to_library(
    field_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Save a field to the library for reuse (admin only)"""
    try:
        name = field_data.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Field name is required")
        
        field_type = field_data.get("field_type", "").strip()
        if not field_type:
            raise HTTPException(status_code=400, detail="Field type is required")
        
        label = field_data.get("label", "").strip()
        if not label:
            raise HTTPException(status_code=400, detail="Field label is required")
        
        library_field_data = {
            "id": str(uuid.uuid4()),
            "name": name,
            "field_type": field_type,
            "label": label,
            "description": field_data.get("description"),
            "placeholder": field_data.get("placeholder"),
            "required": field_data.get("required", False),
            "validation_rules": field_data.get("validation_rules", {}),
            "options": field_data.get("options", []),
            "conditional_logic": field_data.get("conditional_logic", {}),
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        
        response = supabase_storage.table("field_library").insert(library_field_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save field to library")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/field-library", response_model=list)
async def get_field_library(
    field_type: Optional[str] = Query(None),
    current_admin: dict = Depends(get_current_admin)
):
    """Get all fields from the library (admin only)"""
    try:
        query = supabase_storage.table("field_library").select("*")
        
        if field_type:
            query = query.eq("field_type", field_type)
        
        response = query.order("created_at", desc=True).execute()
        
        return response.data or []
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/field-library/{field_id}")
async def delete_field_from_library(
    field_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete a field from the library (admin only)"""
    try:
        # Verify field exists
        field_check = supabase_storage.table("field_library").select("id").eq("id", field_id).execute()
        if not field_check.data:
            raise HTTPException(status_code=404, detail="Field not found in library")
        
        # Delete field
        supabase_storage.table("field_library").delete().eq("id", field_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Form Versioning Endpoints
@router.post("/{form_id}/versions", response_model=dict)
async def create_form_version(
    form_id: str,
    version_data: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Create a new version snapshot of a form (admin only)"""
    try:
        # Verify form exists
        form_response = supabase_storage.table("forms").select("*, form_fields(*)").eq("id", form_id).single().execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = form_response.data
        
        # Get current max version number
        versions_response = supabase_storage.table("form_versions").select("version_number").eq("form_id", form_id).order("version_number", desc=True).limit(1).execute()
        max_version = 0
        if versions_response.data and len(versions_response.data) > 0:
            max_version = versions_response.data[0].get("version_number", 0)
        
        # Prepare form data snapshot
        form_snapshot = {
            "name": form.get("name"),
            "description": form.get("description"),
            "status": form.get("status"),
            "theme": form.get("theme"),
            "settings": form.get("settings"),
            "welcome_screen": form.get("welcome_screen"),
            "thank_you_screen": form.get("thank_you_screen"),
            "fields": sorted(form.get("form_fields", []), key=lambda x: x.get("order_index", 0)),
        }
        
        version_db_data = {
            "id": str(uuid.uuid4()),
            "form_id": form_id,
            "version_number": max_version + 1,
            "form_data": form_snapshot,
            "notes": version_data.get("notes", "").strip() or None,
            "created_at": datetime.now().isoformat(),
        }
        
        response = supabase_storage.table("form_versions").insert(version_db_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create version")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}/versions", response_model=list)
async def get_form_versions(
    form_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get all versions of a form (admin only)"""
    try:
        # Verify form exists
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        response = supabase_storage.table("form_versions").select("*").eq("form_id", form_id).order("version_number", desc=True).execute()
        
        return response.data or []
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{form_id}/versions/{version_id}/restore", response_model=dict)
async def restore_form_version(
    form_id: str,
    version_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Restore a form to a previous version (admin only)"""
    try:
        # Verify form exists
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Get version
        version_response = supabase_storage.table("form_versions").select("*").eq("id", version_id).eq("form_id", form_id).single().execute()
        if not version_response.data:
            raise HTTPException(status_code=404, detail="Version not found")
        
        version = version_response.data
        form_data = version.get("form_data", {})
        
        # Update form with version data
        update_data = {
            "name": form_data.get("name"),
            "description": form_data.get("description"),
            "theme": form_data.get("theme", {}),
            "settings": form_data.get("settings", {}),
            "welcome_screen": form_data.get("welcome_screen"),
            "thank_you_screen": form_data.get("thank_you_screen"),
            "updated_at": datetime.now().isoformat(),
        }
        
        supabase_storage.table("forms").update(update_data).eq("id", form_id).execute()
        
        # Restore fields
        fields_data = form_data.get("fields", [])
        if fields_data:
            # Delete existing fields
            supabase_storage.table("form_fields").delete().eq("form_id", form_id).execute()
            
            # Insert restored fields
            for idx, field in enumerate(fields_data):
                field_db_data = {
                    "id": str(uuid.uuid4()),
                    "form_id": form_id,
                    "field_type": field.get("field_type"),
                    "label": field.get("label", ""),
                    "description": field.get("description"),
                    "placeholder": field.get("placeholder"),
                    "required": field.get("required", False),
                    "validation_rules": field.get("validation_rules", {}),
                    "options": field.get("options", []),
                    "order_index": idx,
                    "conditional_logic": field.get("conditional_logic", {}),
                    "created_at": datetime.now().isoformat(),
                }
                supabase_storage.table("form_fields").insert(field_db_data).execute()
        
        return {"success": True, "message": f"Form restored to version {version.get('version_number')}"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{form_id}/submissions/{submission_id}/review-status", response_model=FormSubmission)
async def update_submission_review_status(
    form_id: str, 
    submission_id: str, 
    review_status: dict,
    current_admin: dict = Depends(get_current_admin)
):
    """Update the review status of a submission (admin only)"""
    try:
        # Verify form exists
        form_check = supabase_storage.table("forms").select("id").eq("id", form_id).execute()
        if not form_check.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Verify submission exists
        submission_check = supabase_storage.table("form_submissions").select("id").eq("id", submission_id).eq("form_id", form_id).execute()
        if not submission_check.data:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Validate review_status
        new_status = review_status.get("review_status")
        if new_status not in ["new", "reviewed", "archived"]:
            raise HTTPException(status_code=400, detail="Invalid review_status. Must be 'new', 'reviewed', or 'archived'")
        
        # Update submission
        response = supabase_storage.table("form_submissions").update({"review_status": new_status}).eq("id", submission_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update submission")
        
        # Fetch complete submission with answers
        full_response = supabase_storage.table("form_submissions").select("*, form_submission_answers(*)").eq("id", submission_id).single().execute()
        
        if not full_response.data:
            raise HTTPException(status_code=500, detail="Failed to fetch updated submission")
        
        submission = full_response.data
        
        # Map form_submission_answers to answers for Pydantic model
        answers = submission.get("form_submission_answers", [])
        submission["answers"] = answers
        if "form_submission_answers" in submission:
            del submission["form_submission_answers"]
        
        return submission
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{form_id}/submit", response_model=FormSubmission)
async def submit_form(form_id: str, submission: FormSubmissionCreate, request: Request):
    """Submit a form response"""
    try:
        from datetime import datetime
        import requests as http_requests
        
        # Check if form exists and is published
        form_response = supabase.table("forms").select("id, status, settings").eq("id", form_id).single().execute()
        
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = form_response.data
        
        if form.get("status") != "published":
            raise HTTPException(status_code=400, detail="Form is not published")
        
        # Check expiration date
        settings = form.get("settings") or {}
        if settings.get("expiration_date"):
            try:
                expiration_date = datetime.fromisoformat(settings["expiration_date"].replace("Z", "+00:00"))
                if datetime.utcnow() > expiration_date.replace(tzinfo=None):
                    raise HTTPException(status_code=400, detail="This form has expired and is no longer accepting submissions")
            except (ValueError, TypeError):
                pass  # Invalid date format, ignore
        
        # Check response limits
        if settings.get("max_submissions"):
            try:
                max_submissions = int(settings["max_submissions"])
                # Count completed submissions
                count_response = supabase.table("form_submissions").select("id", count="exact").eq("form_id", form_id).eq("status", "completed").execute()
                current_count = count_response.count if hasattr(count_response, 'count') else len(count_response.data or [])
                
                if current_count >= max_submissions:
                    raise HTTPException(status_code=400, detail=f"This form has reached its maximum submission limit of {max_submissions}")
            except (ValueError, TypeError):
                pass  # Invalid max_submissions value, ignore
        
        # Verify CAPTCHA if enabled
        if settings.get("captcha_enabled"):
            captcha_secret = os.getenv("RECAPTCHA_SECRET_KEY")
            if not captcha_secret:
                logger.warning("CAPTCHA enabled but RECAPTCHA_SECRET_KEY not configured")
            else:
                # Get CAPTCHA token from submission
                captcha_token = None
                if hasattr(submission, 'captcha_token'):
                    captcha_token = submission.captcha_token
                elif isinstance(submission, dict):
                    captcha_token = submission.get("captcha_token")
                
                if not captcha_token:
                    raise HTTPException(status_code=400, detail="CAPTCHA verification required")
                
                # Verify with Google
                verify_url = "https://www.google.com/recaptcha/api/siteverify"
                verify_data = {
                    "secret": captcha_secret,
                    "response": captcha_token,
                    "remoteip": request.client.host if request.client else None,
                }
                
                try:
                    verify_response = http_requests.post(verify_url, data=verify_data, timeout=5)
                    verify_result = verify_response.json()
                    
                    if not verify_result.get("success", False):
                        raise HTTPException(status_code=400, detail="CAPTCHA verification failed. Please try again.")
                except Exception as e:
                    logger.error(f"CAPTCHA verification error: {str(e)}")
                    raise HTTPException(status_code=400, detail="CAPTCHA verification failed. Please try again.")
        
        # Rate limiting: Check IP-based submission limits
        client_ip = request.client.host if request.client else None
        if client_ip:
            # Check submissions from this IP in the last hour
            one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat()
            recent_submissions = supabase.table("form_submissions").select("id").eq("form_id", form_id).eq("ip_address", client_ip).gte("submitted_at", one_hour_ago).execute()
            submission_count = len(recent_submissions.data or [])
            
            # Default limit: 10 submissions per hour per IP
            rate_limit = settings.get("rate_limit_per_hour", 10)
            if submission_count >= rate_limit:
                raise HTTPException(status_code=429, detail=f"Too many submissions. Please try again later. (Limit: {rate_limit} per hour)")
        
        # Create submission
        submission_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        submission_data = {
            "id": submission_id,
            "form_id": form_id,
            "submitter_email": submission.submitter_email,
            "submitter_name": submission.submitter_name,
            "ip_address": submission.ip_address,
            "user_agent": submission.user_agent,
            "started_at": submission.started_at.isoformat() if hasattr(submission.started_at, 'isoformat') else (submission.started_at if isinstance(submission.started_at, str) else now),
            "time_spent_seconds": submission.time_spent_seconds,
            "status": submission.status,
            "review_status": "new",  # Default to 'new' for new submissions
            "submitted_at": now,
        }
        
        submission_response = supabase.table("form_submissions").insert(submission_data).execute()
        
        if not submission_response.data:
            raise HTTPException(status_code=500, detail="Failed to create submission")
        
        created_submission = submission_response.data[0]
        
        # Create answers
        if submission.answers:
            answers_data = []
            for answer in submission.answers:
                answer_data = {
                    "id": str(uuid.uuid4()),
                    "submission_id": submission_id,
                    "field_id": answer.field_id,
                    "answer_text": answer.answer_text,
                    "answer_value": answer.answer_value or {},
                    "created_at": now,
                }
                answers_data.append(answer_data)
            
            if answers_data:
                supabase.table("form_submission_answers").insert(answers_data).execute()
        
        # Fetch complete submission with answers
        response = supabase.table("form_submissions").select("*, form_submission_answers(*)").eq("id", submission_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to fetch submission")
        
        submission = response.data
        
        # Map form_submission_answers to answers for Pydantic model
        answers = submission.get("form_submission_answers", [])
        submission["answers"] = answers
        # Remove form_submission_answers to avoid confusion
        if "form_submission_answers" in submission:
            del submission["form_submission_answers"]
        
        # Get form name for email notification
        form_name = "Form"
        try:
            form_detail_response = supabase.table("forms").select("name").eq("id", form_id).single().execute()
            if form_detail_response.data:
                form_name = form_detail_response.data.get("name", "Form")
        except Exception as e:
            print(f"Warning: Could not fetch form name for notification: {str(e)}")
        
        # Trigger webhooks (async, don't block submission)
        try:
            webhook_service.trigger_submission_webhooks(
                form_id=form_id,
                submission=submission,
                event_type="submission.created"
            )
        except Exception as e:
            logger.error(f"Error triggering webhooks: {str(e)}")
            # Don't fail submission if webhook fails
        
        # Send email notifications to all admins
        admin_emails = get_admin_emails()
        for admin in admin_emails:
            try:
                email_service.send_form_submission_admin_notification(
                    to_email=admin["email"],
                    form_name=form_name,
                    form_id=form_id,
                    submitter_name=submission.get("submitter_name"),
                    submitter_email=submission.get("submitter_email"),
                    submission_id=submission_id
                )
            except Exception as e:
                # Log but don't fail the submission
                print(f"Warning: Failed to send admin notification email to {admin['email']}: {str(e)}")
        
        return submission
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{form_id}/upload-file")
async def upload_file(form_id: str, file: UploadFile = File(...)):
    """Upload a file for a form submission to Supabase Storage"""
    try:
        # Check if form exists
        form_response = supabase.table("forms").select("id").eq("id", form_id).single().execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Validate file size (10MB max)
        file_content = await file.read()
        if len(file_content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
        
        # Generate unique filename
        file_hash = hashlib.md5(file_content).hexdigest()[:8]
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
        unique_filename = f"{form_id}/{file_hash}_{uuid.uuid4().hex[:8]}.{file_extension}" if file_extension else f"{form_id}/{file_hash}_{uuid.uuid4().hex[:8]}"
        
        # Upload to Supabase Storage (bucket: form-uploads)
        # Use service_role client for storage operations (has proper permissions)
        try:
            # Upload the file using storage client
            # Note: We use supabase_storage which uses service_role key if available
            response = supabase_storage.storage.from_("form-uploads").upload(
                unique_filename,
                file_content,
                file_options={
                    "content-type": file.content_type or "application/octet-stream",
                    "upsert": "false"
                }
            )
            print(f"File uploaded successfully: {unique_filename}")
        except HTTPException:
            raise
        except Exception as storage_error:
            error_msg = str(storage_error)
            print(f"Storage upload error: {error_msg}")
            # Provide more helpful error messages
            if "bucket" in error_msg.lower() or "not found" in error_msg.lower():
                raise HTTPException(
                    status_code=500, 
                    detail="Storage bucket 'form-uploads' not configured. Please create it in Supabase Storage dashboard."
                )
            elif "permission" in error_msg.lower() or "policy" in error_msg.lower():
                raise HTTPException(
                    status_code=500,
                    detail="Storage permissions not configured. Please check Supabase Storage policies for 'form-uploads' bucket."
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload file to storage: {error_msg}"
                )
        
        # Get public URL
        try:
            public_url_data = supabase_storage.storage.from_("form-uploads").get_public_url(unique_filename)
        except Exception as url_error:
            print(f"Warning: Could not get public URL: {str(url_error)}")
            # Construct URL manually if get_public_url fails
            import os
            supabase_url = os.getenv("SUPABASE_URL", "")
            public_url_data = f"{supabase_url}/storage/v1/object/public/form-uploads/{unique_filename}"
        
        return {
            "file_url": public_url_data,
            "file_name": file.filename,
            "file_size": len(file_content),
            "file_type": file.content_type,
            "storage_path": unique_filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@router.post("/{form_id}/create-payment-intent")
async def create_payment_intent(form_id: str, amount: float, currency: str = "usd", metadata: Optional[Dict[str, Any]] = None):
    """Create a Stripe payment intent for a form payment field"""
    try:
        # Check if form exists
        form_response = supabase.table("forms").select("id").eq("id", form_id).single().execute()
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Import Stripe service
        from stripe_service import StripeService
        
        # Create payment intent
        payment_intent = StripeService.create_payment_intent(
            amount=Decimal(str(amount)),
            currency=currency,
            customer_id=None,  # No customer required for one-time payments
            metadata={
                "form_id": form_id,
                **(metadata or {})
            }
        )
        
        return payment_intent
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating payment intent: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment intent: {str(e)}")
