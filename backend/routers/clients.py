from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Client, ClientCreate
from database import supabase
from stripe_service import StripeService
import uuid

router = APIRouter(prefix="/api/clients", tags=["clients"])

@router.get("", response_model=List[Client])
async def get_clients():
    """Get all clients"""
    try:
        response = supabase.table("clients").select("*").order("name").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{client_id}", response_model=Client)
async def get_client(client_id: str):
    """Get a specific client"""
    try:
        response = supabase.table("clients").select("*").eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=Client)
async def create_client(client: ClientCreate):
    """Create a new client"""
    try:
        client_data = client.dict()
        client_data.update({
            "id": str(uuid.uuid4()),
            "created_at": datetime.now().isoformat()
        })
        
        # Create Stripe customer if email is provided
        if client_data.get("email"):
            try:
                stripe_customer_id = StripeService.create_or_get_customer(client_data)
                client_data["stripe_customer_id"] = stripe_customer_id
            except Exception as e:
                # Log error but don't fail client creation
                print(f"Failed to create Stripe customer: {e}")
        
        response = supabase.table("clients").insert(client_data).execute()
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{client_id}", response_model=Client)
async def update_client(client_id: str, client: ClientCreate):
    """Update a client"""
    try:
        # Get existing client to check for Stripe customer ID
        existing_response = supabase.table("clients").select("*").eq("id", client_id).execute()
        if not existing_response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        existing_client = existing_response.data[0]
        client_data = client.dict()
        
        # Create or update Stripe customer if email is provided
        if client_data.get("email"):
            try:
                stripe_customer_id = StripeService.create_or_get_customer(
                    {**client_data, "id": client_id},
                    existing_client.get("stripe_customer_id")
                )
                client_data["stripe_customer_id"] = stripe_customer_id
            except Exception as e:
                # Log error but don't fail client update
                print(f"Failed to update Stripe customer: {e}")
        
        response = supabase.table("clients").update(client_data).eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{client_id}")
async def delete_client(client_id: str):
    """Delete a client"""
    try:
        response = supabase.table("clients").delete().eq("id", client_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        return {"message": "Client deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

