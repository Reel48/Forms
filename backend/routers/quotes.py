from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
from decimal import Decimal
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Quote, QuoteCreate, QuoteUpdate, LineItem, LineItemCreate
from database import supabase
from stripe_service import StripeService
import uuid

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

def calculate_line_item_total(item: LineItemCreate) -> Decimal:
    """Calculate total for a line item"""
    subtotal = item.quantity * item.unit_price
    discount_amount = subtotal * (item.discount_percent or Decimal("0")) / Decimal("100")
    after_discount = subtotal - discount_amount
    tax = after_discount * (item.tax_rate or Decimal("0")) / Decimal("100")
    return after_discount + tax

def calculate_quote_totals(line_items: List[dict], tax_rate: Decimal) -> dict:
    """Calculate subtotal, tax, and total for a quote"""
    subtotal = sum(
        Decimal(item["quantity"]) * Decimal(item["unit_price"]) 
        - (Decimal(item["quantity"]) * Decimal(item["unit_price"]) * Decimal(item.get("discount_percent", 0)) / Decimal("100"))
        for item in line_items
    )
    tax_amount = subtotal * tax_rate / Decimal("100")
    total = subtotal + tax_amount
    return {
        "subtotal": str(subtotal),
        "tax_amount": str(tax_amount),
        "total": str(total)
    }

@router.get("", response_model=List[Quote])
async def get_quotes():
    """Get all quotes"""
    try:
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{quote_id}", response_model=Quote)
async def get_quote(quote_id: str):
    """Get a specific quote"""
    try:
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=Quote)
async def create_quote(quote: QuoteCreate):
    """Create a new quote"""
    try:
        # Generate quote number
        quote_number = f"QT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        
        # Calculate totals
        line_items_data = [item.dict() for item in quote.line_items]
        totals = calculate_quote_totals(line_items_data, quote.tax_rate)
        
        # Create quote
        quote_data = quote.dict(exclude={"line_items"})
        quote_data.update({
            "id": str(uuid.uuid4()),
            "quote_number": quote_number,
            "subtotal": totals["subtotal"],
            "tax_amount": totals["tax_amount"],
            "total": totals["total"],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        })
        
        quote_response = supabase.table("quotes").insert(quote_data).execute()
        created_quote = quote_response.data[0]
        
        # Create line items
        if quote.line_items:
            line_items_to_insert = []
            for item in quote.line_items:
                line_total = calculate_line_item_total(item)
                line_items_to_insert.append({
                    "id": str(uuid.uuid4()),
                    "quote_id": created_quote["id"],
                    "description": item.description,
                    "quantity": str(item.quantity),
                    "unit_price": str(item.unit_price),
                    "discount_percent": str(item.discount_percent or Decimal("0")),
                    "tax_rate": str(item.tax_rate or Decimal("0")),
                    "line_total": str(line_total)
                })
            
            supabase.table("line_items").insert(line_items_to_insert).execute()
        
        # Fetch complete quote with relations
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", created_quote["id"]).execute()
        return response.data[0]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{quote_id}/accept", response_model=Quote)
async def accept_quote(quote_id: str):
    """Accept a quote and optionally create Stripe invoice"""
    try:
        # Update quote status to accepted
        update_data = {
            "status": "accepted",
            "updated_at": datetime.now().isoformat()
        }
        
        response = supabase.table("quotes").update(update_data).eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Fetch complete quote with relations
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{quote_id}", response_model=Quote)
async def update_quote(quote_id: str, quote_update: QuoteUpdate):
    """Update a quote"""
    try:
        update_data = quote_update.dict(exclude_unset=True)
        update_data["updated_at"] = datetime.now().isoformat()
        
        # If line items are being updated, recalculate totals
        if update_data.get("tax_rate") is not None or "line_items" in update_data:
            # Fetch current quote with line items
            current_response = supabase.table("quotes").select("*, line_items(*)").eq("id", quote_id).execute()
            if not current_response.data:
                raise HTTPException(status_code=404, detail="Quote not found")
            
            current_quote = current_response.data[0]
            line_items = current_response.data[0].get("line_items", [])
            
            # Recalculate totals
            tax_rate = Decimal(update_data.get("tax_rate", current_quote.get("tax_rate", 0)))
            totals = calculate_quote_totals(line_items, tax_rate)
            update_data.update(totals)
        
        response = supabase.table("quotes").update(update_data).eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Fetch complete quote with relations
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        return response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{quote_id}")
async def delete_quote(quote_id: str):
    """Delete a quote"""
    try:
        # Delete line items first (foreign key constraint)
        supabase.table("line_items").delete().eq("quote_id", quote_id).execute()
        
        # Delete quote
        response = supabase.table("quotes").delete().eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        return {"message": "Quote deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

