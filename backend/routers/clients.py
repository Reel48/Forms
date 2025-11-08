from fastapi import APIRouter, HTTPException
from typing import List
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Client, ClientCreate
from database import supabase
from stripe_service import StripeService

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
        # Use model_dump() for Pydantic v2 compatibility, fallback to dict() for v1
        try:
            client_data = client.model_dump(exclude_none=True)
        except AttributeError:
            client_data = client.dict(exclude_none=True)
        
        print(f"DEBUG: Client data to insert: {client_data}")
        
        # Let Supabase generate UUID and created_at automatically
        # Only include fields that are provided
        
        # Create Stripe customer if email is provided
        stripe_customer_id = None
        if client_data.get("email"):
            try:
                stripe_customer_id = StripeService.create_or_get_customer(client_data)
                client_data["stripe_customer_id"] = stripe_customer_id
            except Exception as e:
                # Log error but don't fail client creation
                print(f"Failed to create Stripe customer: {e}")
        
        # Insert into Supabase (let it generate id and created_at)
        print(f"DEBUG: Inserting into Supabase: {client_data}")
        insert_response = supabase.table("clients").insert(client_data).execute()
        
        print(f"DEBUG: Insert response: {insert_response}")
        print(f"DEBUG: Insert response data: {insert_response.data}")
        
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to create client: No data returned")
        
        # Get the created client ID
        created_client_id = insert_response.data[0]["id"]
        
        # Fetch the complete client record with all fields
        print(f"DEBUG: Fetching created client with id: {created_client_id}")
        response = supabase.table("clients").select("*").eq("id", created_client_id).execute()
        
        print(f"DEBUG: Fetch response: {response}")
        print(f"DEBUG: Fetch response data: {response.data}")
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to fetch created client")
        
        # Try to validate the response
        try:
            result = response.data[0]
            print(f"DEBUG: Returning result: {result}")
            # Validate using the Client model
            validated_client = Client(**result)
            return validated_client
        except Exception as validation_error:
            print(f"DEBUG: Validation error: {validation_error}")
            import traceback
            traceback.print_exc()
            # Return the raw data anyway, but log the validation error
            return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_details = str(e)
        print(f"DEBUG: Full error traceback:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create client: {error_details}")

@router.put("/{client_id}", response_model=Client)
async def update_client(client_id: str, client: ClientCreate):
    """Update a client"""
    try:
        # Get existing client to check for Stripe customer ID
        existing_response = supabase.table("clients").select("*").eq("id", client_id).execute()
        if not existing_response.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        existing_client = existing_response.data[0]
        # Use model_dump() for Pydantic v2 compatibility, fallback to dict() for v1
        try:
            client_data = client.model_dump(exclude_none=True)
        except AttributeError:
            client_data = client.dict(exclude_none=True)
        
        # Create or update Stripe customer if email is provided
        if client_data.get("email"):
            try:
                stripe_customer_id = StripeService.create_or_get_customer(
                    {**client_data, "id": client_id},
                    existing_client.get("stripe_customer_id"),
                    update_if_exists=True  # Update existing customer with new address/data
                )
                client_data["stripe_customer_id"] = stripe_customer_id
            except Exception as e:
                # Log error but don't fail client update
                print(f"Failed to update Stripe customer: {e}")
        
        # Use .select("*") to ensure we get all fields back
        response = supabase.table("clients").update(client_data).eq("id", client_id).select("*").execute()
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

