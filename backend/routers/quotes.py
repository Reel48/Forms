from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Quote, QuoteCreate, QuoteUpdate, LineItem, LineItemCreate
from database import supabase
from stripe_service import StripeService
from auth import get_current_user, get_current_admin, get_optional_user
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
async def get_quotes(
    search: Optional[str] = Query(None, description="Search by title, quote number, or client name"),
    status: Optional[str] = Query(None, description="Filter by quote status (draft, sent, viewed, accepted, declined)"),
    payment_status: Optional[str] = Query(None, description="Filter by payment status (unpaid, paid, partially_paid, refunded, failed, voided, uncollectible)"),
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get all quotes with optional filtering.
    Admins see all quotes. Customers see only assigned quotes.
    """
    try:
        # Valid status values
        valid_statuses = {"draft", "sent", "viewed", "accepted", "declined"}
        valid_payment_statuses = {"unpaid", "paid", "partially_paid", "refunded", "failed", "voided", "uncollectible"}
        
        # Validate status values
        if status is not None and status not in valid_statuses:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}"
            )
        
        if payment_status is not None and payment_status not in valid_payment_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid payment_status. Must be one of: {', '.join(sorted(valid_payment_statuses))}"
            )
        
        # Start building query
        query = supabase.table("quotes").select("*, clients(*), line_items(*)")
        
        # If customer, only show assigned quotes
        if current_user and current_user.get("role") == "customer":
            # Get assigned quote IDs
            assignments_response = supabase.table("quote_assignments").select("quote_id").eq("user_id", current_user["id"]).execute()
            assigned_quote_ids = [a["quote_id"] for a in (assignments_response.data or [])]
            
            if not assigned_quote_ids:
                return []  # No assigned quotes
            
            query = query.in_("id", assigned_quote_ids)
        
        # Apply status filter
        if status:
            query = query.eq("status", status)
        
        # Apply payment_status filter
        # Note: For "unpaid", we need to include null values, so we'll filter in memory
        # For other statuses, we can filter at the database level
        if payment_status and payment_status != "unpaid":
            query = query.eq("payment_status", payment_status)
        
        # Apply text search - search across title and quote_number
        # Note: We'll filter client name in memory after fetching since Supabase
        # doesn't easily support filtering on joined table fields
        if search and search.strip():
            search_term = search.strip()
            # Use ilike for case-insensitive search on title
            # For quote_number, we'll also search in memory for better control
            query = query.ilike("title", f"%{search_term}%")
        
        # Order by created_at descending
        query = query.order("created_at", desc=True)
        
        # Execute query
        response = query.execute()
        quotes = response.data
        
        # Apply additional filters in memory for cases Supabase can't handle easily
        if search and search.strip():
            search_term_lower = search.strip().lower()
            quotes = [
                quote for quote in quotes
                if (
                    search_term_lower in quote.get("title", "").lower() or
                    search_term_lower in quote.get("quote_number", "").lower() or
                    (quote.get("clients") and search_term_lower in quote.get("clients", {}).get("name", "").lower())
                )
            ]
        
        # Handle null payment_status: if filtering for "unpaid", include both "unpaid" and null values
        # If filtering for other payment_status, ensure we only get exact matches
        if payment_status:
            if payment_status == "unpaid":
                quotes = [
                    quote for quote in quotes
                    if quote.get("payment_status") is None or quote.get("payment_status") == "unpaid"
                ]
            else:
                # For other statuses, ensure exact match (already filtered by DB, but double-check)
                quotes = [
                    quote for quote in quotes
                    if quote.get("payment_status") == payment_status
                ]
        
        return quotes
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{quote_id}", response_model=Quote)
async def get_quote(quote_id: str, current_user: Optional[dict] = Depends(get_optional_user)):
    """Get a specific quote.
    Admins can see any quote. Customers can only see assigned quotes.
    """
    try:
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # If customer, verify they have access
        if current_user and current_user.get("role") == "customer":
            assignment = supabase.table("quote_assignments").select("id").eq("quote_id", quote_id).eq("user_id", current_user["id"]).execute()
            if not assignment.data:
                raise HTTPException(status_code=403, detail="You don't have access to this quote")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=Quote)
async def create_quote(quote: QuoteCreate, current_admin: dict = Depends(get_current_admin)):
    """Create a new quote (admin only)"""
    try:
        # Generate quote number
        quote_number = f"QT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        
        # Calculate totals
        # Convert line items to dict, ensuring Decimal fields are strings
        line_items_data = []
        for item in quote.line_items:
            item_dict = item.model_dump() if hasattr(item, 'model_dump') else item.dict()
            # Convert Decimal fields to strings
            for key, value in item_dict.items():
                if isinstance(value, Decimal):
                    item_dict[key] = str(value)
            line_items_data.append(item_dict)
        
        totals = calculate_quote_totals(line_items_data, quote.tax_rate)
        
        # Create quote - convert Decimal fields to strings for JSON serialization
        quote_data = quote.model_dump(exclude={"line_items"}) if hasattr(quote, 'model_dump') else quote.dict(exclude={"line_items"})
        # Convert any remaining Decimal fields to strings
        for key, value in quote_data.items():
            if isinstance(value, Decimal):
                quote_data[key] = str(value)
        
        quote_data.update({
            "id": str(uuid.uuid4()),
            "quote_number": quote_number,
            "subtotal": totals["subtotal"],
            "tax_amount": totals["tax_amount"],
            "total": totals["total"],
            "created_by": current_admin["id"],
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
async def accept_quote(quote_id: str, current_user: dict = Depends(get_current_user)):
    """Accept a quote and optionally create Stripe invoice.
    Customers can accept their assigned quotes. Admins can accept any quote.
    """
    try:
        # If customer, verify they have access to this quote
        if current_user.get("role") == "customer":
            assignment = supabase.table("quote_assignments").select("id").eq("quote_id", quote_id).eq("user_id", current_user["id"]).execute()
            if not assignment.data:
                raise HTTPException(status_code=403, detail="You don't have access to this quote")
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
async def update_quote(quote_id: str, quote_update: QuoteUpdate, current_admin: dict = Depends(get_current_admin)):
    """Update a quote (admin only)"""
    try:
        # Convert to dict, ensuring Decimal fields are strings
        update_data = quote_update.model_dump(exclude_unset=True) if hasattr(quote_update, 'model_dump') else quote_update.dict(exclude_unset=True)
        # Convert any Decimal fields to strings
        for key, value in update_data.items():
            if isinstance(value, Decimal):
                update_data[key] = str(value)
        
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
async def delete_quote(quote_id: str, current_admin: dict = Depends(get_current_admin)):
    """Delete a quote (admin only)"""
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

