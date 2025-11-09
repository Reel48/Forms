from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import datetime
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Form, FormCreate, FormUpdate, FormField, FormFieldCreate, FormSubmissionCreate, FormSubmission
from database import supabase
import uuid
import secrets
import string

router = APIRouter(prefix="/api/forms", tags=["forms"])

def generate_url_slug() -> str:
    """Generate a unique URL slug for forms"""
    while True:
        slug = 'form-' + ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
        # Check if slug exists
        existing = supabase.table("forms").select("id").eq("public_url_slug", slug).execute()
        if not existing.data:
            return slug

@router.get("", response_model=List[Form])
async def get_forms(
    status: Optional[str] = Query(None, description="Filter by status (draft, published, archived)"),
    search: Optional[str] = Query(None, description="Search by name or description")
):
    """Get all forms with optional filtering"""
    try:
        query = supabase.table("forms").select("*, form_fields(*)")
        
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
        
        # Sort fields by order_index
        for form in forms:
            if form.get("form_fields"):
                form["form_fields"] = sorted(form["form_fields"], key=lambda x: x.get("order_index", 0))
        
        return forms
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/public/{slug}", response_model=Form)
async def get_form_by_slug(slug: str):
    """Get a form by public URL slug (for public access)"""
    try:
        response = supabase.table("forms").select("*, form_fields(*)").eq("public_url_slug", slug).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = response.data
        
        # Check if form is published
        if form.get("status") != "published":
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Sort fields by order_index
        if form.get("form_fields"):
            form["form_fields"] = sorted(form["form_fields"], key=lambda x: x.get("order_index", 0))
        
        return form
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{form_id}", response_model=Form)
async def get_form(form_id: str):
    """Get a single form by ID with all fields"""
    try:
        response = supabase.table("forms").select("*, form_fields(*)").eq("id", form_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        form = response.data
        
        # Sort fields by order_index
        if form.get("form_fields"):
            form["form_fields"] = sorted(form["form_fields"], key=lambda x: x.get("order_index", 0))
        
        return form
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=Form)
async def create_form(form: FormCreate):
    """Create a new form with fields"""
    try:
        # Generate form data
        form_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        # Generate public URL slug if not provided
        public_url_slug = form.public_url_slug or generate_url_slug()
        
        # Prepare form data
        form_data = {
            "id": form_id,
            "name": form.name,
            "description": form.description,
            "status": form.status,
            "public_url_slug": public_url_slug,
            "theme": form.theme or {},
            "settings": form.settings or {},
            "welcome_screen": form.welcome_screen or {},
            "thank_you_screen": form.thank_you_screen or {},
            "created_at": now,
            "updated_at": now
        }
        
        # Create form
        form_response = supabase.table("forms").insert(form_data).execute()
        
        if not form_response.data:
            raise HTTPException(status_code=500, detail="Failed to create form")
        
        created_form = form_response.data[0]
        
        # Create fields if provided
        if form.fields:
            fields_data = []
            for idx, field in enumerate(form.fields):
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
                    "order_index": field.order_index if field.order_index > 0 else idx,
                    "conditional_logic": field.conditional_logic or {},
                    "created_at": now
                }
                fields_data.append(field_data)
            
            if fields_data:
                supabase.table("form_fields").insert(fields_data).execute()
        
        # Fetch the complete form with fields
        return await get_form(form_id)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}", response_model=Form)
async def update_form(form_id: str, form_update: FormUpdate):
    """Update a form"""
    try:
        # Check if form exists
        existing = supabase.table("forms").select("id").eq("id", form_id).execute()
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
        supabase.table("forms").update(update_data).eq("id", form_id).execute()
        
        # Return updated form
        return await get_form(form_id)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{form_id}")
async def delete_form(form_id: str):
    """Delete a form and all its fields"""
    try:
        # Check if form exists
        existing = supabase.table("forms").select("id").eq("id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Delete form (cascade will delete fields, submissions, and answers)
        supabase.table("forms").delete().eq("id", form_id).execute()
        
        return {"message": "Form deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Field management endpoints
@router.post("/{form_id}/fields", response_model=FormField)
async def create_field(form_id: str, field: FormFieldCreate):
    """Add a field to a form"""
    try:
        # Check if form exists
        existing = supabase.table("forms").select("id").eq("id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Get current max order_index
        fields_response = supabase.table("form_fields").select("order_index").eq("form_id", form_id).order("order_index", desc=True).limit(1).execute()
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
        
        response = supabase.table("form_fields").insert(field_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create field")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}/fields/{field_id}", response_model=FormField)
async def update_field(form_id: str, field_id: str, field_update: dict):
    """Update a form field"""
    try:
        # Check if field exists and belongs to form
        existing = supabase.table("form_fields").select("id").eq("id", field_id).eq("form_id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Field not found")
        
        # Update field
        response = supabase.table("form_fields").update(field_update).eq("id", field_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update field")
        
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{form_id}/fields/{field_id}")
async def delete_field(form_id: str, field_id: str):
    """Delete a form field"""
    try:
        # Check if field exists and belongs to form
        existing = supabase.table("form_fields").select("id").eq("id", field_id).eq("form_id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Field not found")
        
        # Delete field
        supabase.table("form_fields").delete().eq("id", field_id).execute()
        
        return {"message": "Field deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{form_id}/fields/reorder")
async def reorder_fields(form_id: str, field_orders: List[dict]):
    """Reorder form fields"""
    try:
        # Check if form exists
        existing = supabase.table("forms").select("id").eq("id", form_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Update order_index for each field
        for field_order in field_orders:
            field_id = field_order.get("field_id")
            order_index = field_order.get("order_index")
            
            if field_id and order_index is not None:
                supabase.table("form_fields").update({"order_index": order_index}).eq("id", field_id).eq("form_id", form_id).execute()
        
        return {"message": "Fields reordered successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Form Submission endpoints
@router.post("/{form_id}/submit", response_model=FormSubmission)
async def submit_form(form_id: str, submission: FormSubmissionCreate):
    """Submit a form response"""
    try:
        # Check if form exists and is published
        form_response = supabase.table("forms").select("id, status").eq("id", form_id).single().execute()
        
        if not form_response.data:
            raise HTTPException(status_code=404, detail="Form not found")
        
        if form_response.data.get("status") != "published":
            raise HTTPException(status_code=400, detail="Form is not published")
        
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
        
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
