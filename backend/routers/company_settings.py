from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import CompanySettings, CompanySettingsUpdate
from database import supabase_storage

router = APIRouter(prefix="/api/company-settings", tags=["company-settings"])

@router.get("", response_model=CompanySettings)
async def get_company_settings():
    """Get company settings (returns first/only row)"""
    try:
        response = supabase_storage.table("company_settings").select("*").limit(1).execute()
        if not response.data:
            # Return default empty settings if none exist
            return {
                "id": "",
                "company_name": None,
                "email": None,
                "phone": None,
                "address": None,
                "website": None,
                "tax_id": None,
                "logo_url": None,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("", response_model=CompanySettings)
async def update_company_settings(settings: CompanySettingsUpdate):
    """Update company settings (upsert - creates if doesn't exist)"""
    try:
        # Check if settings exist
        existing = supabase_storage.table("company_settings").select("*").limit(1).execute()
        
        # Convert to dict, excluding None values for update
        update_data = settings.model_dump(exclude_unset=True) if hasattr(settings, 'model_dump') else settings.dict(exclude_unset=True)
        update_data["updated_at"] = datetime.now().isoformat()
        
        if existing.data:
            # Update existing
            response = supabase_storage.table("company_settings").update(update_data).eq("id", existing.data[0]["id"]).execute()
            if not response.data:
                raise HTTPException(status_code=404, detail="Company settings not found")
            return response.data[0]
        else:
            # Create new
            import uuid
            update_data["id"] = str(uuid.uuid4())
            update_data["created_at"] = datetime.now().isoformat()
            response = supabase_storage.table("company_settings").insert(update_data).execute()
            if not response.data:
                raise HTTPException(status_code=500, detail="Failed to create company settings")
            return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

