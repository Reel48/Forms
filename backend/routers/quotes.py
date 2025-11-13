from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import List, Optional
from datetime import datetime, timedelta
from decimal import Decimal
import sys
import os
import logging
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Quote, QuoteCreate, QuoteUpdate, LineItem, LineItemCreate
from database import supabase, supabase_storage, supabase_url, supabase_service_role_key
from stripe_service import StripeService
from auth import get_current_user, get_current_admin, get_optional_user
from email_service import email_service
from email_utils import get_admin_emails
import uuid
import requests

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

def calculate_line_item_total(item: LineItemCreate, use_line_tax: bool = True, quote_tax_rate: Decimal = Decimal("0")) -> Decimal:
    """Calculate total for a line item with flexible tax calculation"""
    subtotal = item.quantity * item.unit_price
    discount_amount = subtotal * (item.discount_percent or Decimal("0")) / Decimal("100")
    after_discount = subtotal - discount_amount
    
    # Use line-item specific tax rate if provided and use_line_tax is True, otherwise use quote-level tax
    if use_line_tax and item.tax_rate:
        line_tax_rate = item.tax_rate
    else:
        line_tax_rate = quote_tax_rate
    
    tax = after_discount * line_tax_rate / Decimal("100")
    return after_discount + tax

def calculate_quote_totals(line_items: List[dict], tax_rate: Decimal, tax_method: str = "after_discount") -> dict:
    """
    Calculate subtotal, tax, and total for a quote with flexible tax calculation.
    
    tax_method options:
    - "after_discount": Tax applied to amount after discount (default)
    - "before_discount": Tax applied to subtotal before discount
    - "line_item": Use individual line item tax rates (ignores quote-level tax_rate)
    """
    subtotal = Decimal("0")
    tax_amount = Decimal("0")
    
    for item in line_items:
        qty = Decimal(item["quantity"])
        price = Decimal(item["unit_price"])
        discount_pct = Decimal(item.get("discount_percent", 0))
        
        line_subtotal = qty * price
        discount_amount = line_subtotal * discount_pct / Decimal("100")
        after_discount = line_subtotal - discount_amount
        
        subtotal += after_discount
        
        # Calculate tax based on method
        if tax_method == "line_item":
            # Use line item's own tax rate
            line_tax_rate = Decimal(item.get("tax_rate", 0))
            if tax_method == "before_discount":
                taxable_amount = line_subtotal
            else:
                taxable_amount = after_discount
            line_tax = taxable_amount * line_tax_rate / Decimal("100")
            tax_amount += line_tax
        else:
            # Use quote-level tax rate
            if tax_method == "before_discount":
                taxable_amount = line_subtotal
            else:  # after_discount
                taxable_amount = after_discount
            # Don't add here, we'll calculate total tax at the end
    
    # If not using line_item method, calculate tax on total subtotal
    if tax_method != "line_item":
        if tax_method == "before_discount":
            # Recalculate subtotal before discount for tax calculation
            subtotal_before_discount = sum(
                Decimal(item["quantity"]) * Decimal(item["unit_price"])
                for item in line_items
            )
            tax_amount = subtotal_before_discount * tax_rate / Decimal("100")
            # Recalculate subtotal after discount for display
            subtotal = sum(
                Decimal(item["quantity"]) * Decimal(item["unit_price"]) 
                - (Decimal(item["quantity"]) * Decimal(item["unit_price"]) * Decimal(item.get("discount_percent", 0)) / Decimal("100"))
                for item in line_items
            )
        else:  # after_discount
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
    client_id: Optional[str] = Query(None, description="Filter by client ID"),
    created_from: Optional[str] = Query(None, description="Filter quotes created from this date (YYYY-MM-DD)"),
    created_to: Optional[str] = Query(None, description="Filter quotes created to this date (YYYY-MM-DD)"),
    expiration_from: Optional[str] = Query(None, description="Filter quotes expiring from this date (YYYY-MM-DD)"),
    expiration_to: Optional[str] = Query(None, description="Filter quotes expiring to this date (YYYY-MM-DD)"),
    sort_by: Optional[str] = Query("created_at", description="Sort by field (created_at, total, status, quote_number)"),
    sort_order: Optional[str] = Query("desc", description="Sort order (asc, desc)"),
    limit: Optional[int] = Query(None, description="Limit number of results"),
    offset: Optional[int] = Query(0, description="Offset for pagination"),
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get all quotes with optional filtering, sorting, and pagination.
    Admins see all quotes. Customers see only assigned quotes.
    """
    try:
        # Valid status values
        valid_statuses = {"draft", "sent", "viewed", "accepted", "declined"}
        valid_payment_statuses = {"unpaid", "paid", "partially_paid", "refunded", "failed", "voided", "uncollectible"}
        valid_sort_fields = {"created_at", "total", "status", "quote_number", "title"}
        valid_sort_orders = {"asc", "desc"}
        
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
        
        if sort_by not in valid_sort_fields:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid sort_by. Must be one of: {', '.join(sorted(valid_sort_fields))}"
            )
        
        if sort_order not in valid_sort_orders:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid sort_order. Must be one of: {', '.join(sorted(valid_sort_orders))}"
            )
        
        # Start building query
        query = supabase.table("quotes").select("*, clients(*), line_items(*)")
        
        # If customer, only show assigned quotes
        if current_user and current_user.get("role") == "customer":
            # Get assigned quote IDs using service role client to bypass RLS
            assignments_response = supabase_storage.table("quote_assignments").select("quote_id").eq("user_id", current_user["id"]).execute()
            assigned_quote_ids = [a["quote_id"] for a in (assignments_response.data or [])]
            
            if not assigned_quote_ids:
                return []  # No assigned quotes
            
            query = query.in_("id", assigned_quote_ids)
        
        # Apply client filter
        if client_id:
            query = query.eq("client_id", client_id)
        
        # Apply status filter
        if status:
            query = query.eq("status", status)
        
        # Apply payment_status filter
        # Note: For "unpaid", we need to include null values, so we'll filter in memory
        # For other statuses, we can filter at the database level
        if payment_status and payment_status != "unpaid":
            query = query.eq("payment_status", payment_status)
        
        # Apply date range filters
        if created_from:
            try:
                created_from_date = datetime.strptime(created_from, "%Y-%m-%d")
                query = query.gte("created_at", created_from_date.isoformat())
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid created_from date format. Use YYYY-MM-DD")
        
        if created_to:
            try:
                created_to_date = datetime.strptime(created_to, "%Y-%m-%d")
                # Add one day to include the entire day
                created_to_date = created_to_date + timedelta(days=1)
                query = query.lt("created_at", created_to_date.isoformat())
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid created_to date format. Use YYYY-MM-DD")
        
        if expiration_from:
            try:
                expiration_from_date = datetime.strptime(expiration_from, "%Y-%m-%d")
                query = query.gte("expiration_date", expiration_from_date.isoformat())
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid expiration_from date format. Use YYYY-MM-DD")
        
        if expiration_to:
            try:
                expiration_to_date = datetime.strptime(expiration_to, "%Y-%m-%d")
                expiration_to_date = expiration_to_date + timedelta(days=1)
                query = query.lt("expiration_date", expiration_to_date.isoformat())
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid expiration_to date format. Use YYYY-MM-DD")
        
        # Apply text search - search across title and quote_number
        # Note: We'll filter client name in memory after fetching since Supabase
        # doesn't easily support filtering on joined table fields
        if search and search.strip():
            search_term = search.strip()
            # Use ilike for case-insensitive search on title
            # For quote_number, we'll also search in memory for better control
            query = query.ilike("title", f"%{search_term}%")
        
        # Apply sorting
        desc = sort_order == "desc"
        query = query.order(sort_by, desc=desc)
        
        # Apply pagination
        if limit:
            query = query.limit(limit)
        if offset:
            query = query.offset(offset)
        
        # Execute query - include line_items for search
        response = query.execute()
        quotes = response.data
        
        # Load line items for each quote if we're searching
        if search and search.strip():
            quote_ids = [q["id"] for q in quotes]
            if quote_ids:
                line_items_response = supabase_storage.table("line_items").select("quote_id, description").in_("quote_id", quote_ids).execute()
                line_items_map = {}
                for item in line_items_response.data or []:
                    if item["quote_id"] not in line_items_map:
                        line_items_map[item["quote_id"]] = []
                    line_items_map[item["quote_id"]].append(item.get("description", ""))
                
                # Attach line items to quotes
                for quote in quotes:
                    quote["_line_items_descriptions"] = " ".join(line_items_map.get(quote["id"], []))
        
        # Apply additional filters in memory for cases Supabase can't handle easily
        # Enhanced search across all fields: title, quote_number, client name, notes, terms, line items
        if search and search.strip():
            search_term_lower = search.strip().lower()
            quotes = [
                quote for quote in quotes
                if (
                    search_term_lower in quote.get("title", "").lower() or
                    search_term_lower in quote.get("quote_number", "").lower() or
                    (quote.get("clients") and search_term_lower in quote.get("clients", {}).get("name", "").lower()) or
                    (quote.get("clients") and search_term_lower in quote.get("clients", {}).get("email", "").lower()) or
                    (quote.get("clients") and search_term_lower in quote.get("clients", {}).get("company", "").lower()) or
                    search_term_lower in (quote.get("notes", "") or "").lower() or
                    search_term_lower in (quote.get("terms", "") or "").lower() or
                    search_term_lower in (quote.get("_line_items_descriptions", "") or "").lower() or
                    search_term_lower in str(quote.get("total", "")).lower() or
                    search_term_lower in str(quote.get("subtotal", "")).lower()
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
        
        # If customer, verify they have access using service role client to bypass RLS
        if current_user and current_user.get("role") == "customer":
            assignment = supabase_storage.table("quote_assignments").select("id").eq("quote_id", quote_id).eq("user_id", current_user["id"]).execute()
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
        
        totals = calculate_quote_totals(line_items_data, quote.tax_rate, "after_discount")
        
        # Create quote - convert Decimal fields to strings for JSON serialization
        # Exclude line_items, create_folder, and assign_folder_to_user_id (not database columns)
        exclude_fields = {"line_items", "create_folder", "assign_folder_to_user_id"}
        quote_data = quote.model_dump(exclude=exclude_fields) if hasattr(quote, 'model_dump') else quote.dict(exclude=exclude_fields)
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
        
        # Create folder if requested
        folder_id = None
        if hasattr(quote, 'create_folder') and quote.create_folder:
            try:
                print(f"Creating folder for quote {created_quote['id']} (quote_number: {quote_number})")
                # Generate folder name from quote
                folder_name = f"Order - {quote.title or quote_number}"
                if quote.client_id:
                    # Get client name for folder - use service role client to bypass RLS
                    try:
                        client_response = supabase_storage.table("clients").select("name, company").eq("id", quote.client_id).single().execute()
                        if client_response.data:
                            client_name = client_response.data.get("company") or client_response.data.get("name") or "Client"
                            folder_name = f"{client_name} - {quote.title or quote_number}"
                    except Exception as e:
                        print(f"Warning: Could not fetch client name: {str(e)}")
                
                folder_data = {
                    "id": str(uuid.uuid4()),
                    "name": folder_name,
                    "description": f"Folder for quote {quote_number}",
                    "quote_id": created_quote["id"],
                    "client_id": quote.client_id,
                    "status": "active",
                    "created_by": current_admin["id"],
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }
                
                print(f"Inserting folder with data: {folder_data}")
                # Use service role client to bypass RLS
                folder_response = supabase_storage.table("folders").insert(folder_data).execute()
                if folder_response.data and len(folder_response.data) > 0:
                    folder_id = folder_response.data[0]["id"]
                    print(f"Folder created successfully with ID: {folder_id}")
                    
                    # Update quote with folder_id - use service role client
                    update_response = supabase_storage.table("quotes").update({"folder_id": folder_id}).eq("id", created_quote["id"]).execute()
                    if update_response.data:
                        print(f"Quote updated with folder_id: {folder_id}")
                    else:
                        print(f"Warning: Quote update response was empty")
                    
                    # Assign folder to user if specified
                    assign_user_id = None
                    if hasattr(quote, 'assign_folder_to_user_id') and quote.assign_folder_to_user_id:
                        assign_user_id = quote.assign_folder_to_user_id
                    elif quote.client_id:
                        # Try to find user associated with client - use service role client
                        try:
                            client_response = supabase_storage.table("clients").select("user_id").eq("id", quote.client_id).single().execute()
                            if client_response.data and client_response.data.get("user_id"):
                                assign_user_id = client_response.data["user_id"]
                        except Exception:
                            pass
                    
                    if assign_user_id:
                        try:
                            assignment_data = {
                                "folder_id": folder_id,
                                "user_id": assign_user_id,
                                "role": "viewer",
                                "assigned_by": current_admin["id"],
                                "assigned_at": datetime.now().isoformat()
                            }
                            # Use service role client to bypass RLS
                            supabase_storage.table("folder_assignments").insert(assignment_data).execute()
                            print(f"Folder assigned to user: {assign_user_id}")
                        except Exception as assign_error:
                            print(f"Warning: Could not assign folder to user: {str(assign_error)}")
                else:
                    print(f"Error: Folder creation response was empty or invalid")
            except Exception as folder_error:
                print(f"Error: Could not create folder: {str(folder_error)}")
                import traceback
                traceback.print_exc()
                # Continue without folder - quote creation succeeded
        
        # Fetch complete quote with relations
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", created_quote["id"]).execute()
        created_quote_full = response.data[0]
        
        # Log creation activity
        log_quote_activity(
            quote_id=created_quote["id"],
            activity_type="created",
            user_id=current_admin.get("id"),
            user_name=current_admin.get("name") or current_admin.get("email"),
            user_email=current_admin.get("email"),
            description="Quote created" + (f" with folder" if folder_id else "")
        )
        
        return created_quote_full
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating quote: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create quote: {str(e)}")

@router.put("/{quote_id}/accept", response_model=Quote)
async def accept_quote(quote_id: str, current_user: dict = Depends(get_current_user)):
    """Accept a quote and optionally create Stripe invoice.
    Customers can accept their assigned quotes. Admins can accept any quote.
    """
    try:
        # If customer, verify they have access to this quote using service role client to bypass RLS
        if current_user.get("role") == "customer":
            assignment = supabase_storage.table("quote_assignments").select("id").eq("quote_id", quote_id).eq("user_id", current_user["id"]).execute()
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
        quote = response.data[0]
        
        # Log acceptance activity
        log_quote_activity(
            quote_id=quote_id,
            activity_type="accepted",
            user_id=current_user.get("id"),
            user_name=current_user.get("name") or current_user.get("email"),
            user_email=current_user.get("email"),
            description="Quote accepted"
        )
        
        # If customer accepts, automatically create Stripe invoice
        if current_user.get("role") == "customer" and not quote.get("stripe_invoice_id"):
            try:
                client = quote.get("clients")
                if client:
                    # Get or create Stripe customer
                    customer_id = StripeService.create_or_get_customer(
                        client,
                        client.get("stripe_customer_id")
                    )
                    
                    # Update client with Stripe customer ID if not set
                    if not client.get("stripe_customer_id"):
                        supabase.table("clients").update({
                            "stripe_customer_id": customer_id
                        }).eq("id", client["id"]).execute()
                    
                    # Get line items
                    line_items = quote.get("line_items", [])
                    if line_items:
                        # Create invoice
                        invoice_data = StripeService.create_invoice_from_quote(
                            quote,
                            line_items,
                            customer_id,
                            quote.get("quote_number")
                        )
                        
                        # Update quote with invoice information
                        supabase.table("quotes").update({
                            "stripe_invoice_id": invoice_data["invoice_id"],
                            "updated_at": datetime.now().isoformat()
                        }).eq("id", quote_id).execute()
                        
                        # Refresh quote data to include invoice
                        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
                        quote = response.data[0]
            except Exception as e:
                # Log error but don't fail the acceptance
                print(f"Warning: Failed to automatically create invoice for customer acceptance: {str(e)}")
                # Continue with acceptance even if invoice creation fails
        
        # Get customer information for email notification
        customer_name = None
        customer_email = None
        try:
            # Get customer info from client record
            client = quote.get("clients")
            if client:
                customer_name = client.get("name")
                customer_email = client.get("email")
            
            # Also try to get from user if available
            if current_user.get("role") == "customer":
                customer_email = customer_email or current_user.get("email")
                customer_name = customer_name or current_user.get("name")
        except Exception as e:
            print(f"Warning: Could not fetch customer info for notification: {str(e)}")
        
        # Send email notifications to all admins
        admin_emails = get_admin_emails()
        quote_title = quote.get("title", "Quote")
        quote_number = quote.get("quote_number", "")
        
        for admin in admin_emails:
            try:
                email_service.send_quote_accepted_admin_notification(
                    to_email=admin["email"],
                    quote_title=quote_title,
                    quote_number=quote_number,
                    quote_id=quote_id,
                    customer_name=customer_name,
                    customer_email=customer_email
                )
            except Exception as e:
                # Log but don't fail the acceptance
                print(f"Warning: Failed to send admin notification email to {admin['email']}: {str(e)}")
        
        return quote
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{quote_id}", response_model=Quote)
async def update_quote(quote_id: str, quote_update: QuoteUpdate, current_admin: dict = Depends(get_current_admin)):
    """Update a quote (admin only)"""
    try:
        logger.info(f"=== UPDATE QUOTE CALLED ===")
        logger.info(f"Quote ID: {quote_id}")
        logger.info(f"QuoteUpdate object: {quote_update}")
        logger.info(f"QuoteUpdate type: {type(quote_update)}")
        # Get full dump including all fields
        full_dump = quote_update.model_dump(exclude_unset=False) if hasattr(quote_update, 'model_dump') else quote_update.dict(exclude_unset=False)
        logger.info(f"QuoteUpdate full dump: {full_dump}")
        logger.info(f"QuoteUpdate create_folder in dump: {full_dump.get('create_folder')}")
    except Exception as log_error:
        # If logging fails, at least try to continue
        import sys
        print(f"Logging error (non-fatal): {str(log_error)}", file=sys.stderr, flush=True)
    
    try:
        # Get current quote for comparison - use service role client to ensure we get folder_id
        current_response = supabase_storage.table("quotes").select("*, line_items(*)").eq("id", quote_id).execute()
        if not current_response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        current_quote = current_response.data[0]
        old_status = current_quote.get("status")
        
        # Convert to dict, ensuring Decimal fields are strings
        # Use exclude_none=False to ensure create_folder is included even if it's True
        update_data = quote_update.model_dump(exclude_unset=True, exclude_none=False) if hasattr(quote_update, 'model_dump') else quote_update.dict(exclude_unset=True)
        
        # Store create_folder value before removing it (it's not a database field)
        # Check both the dict and the model attribute to be safe
        create_folder_value = update_data.pop('create_folder', None)
        if create_folder_value is None:
            # Also check the model attribute directly
            create_folder_value = getattr(quote_update, 'create_folder', None)
        
        logger.info(f"DEBUG: Extracted create_folder value: {create_folder_value}")
        logger.info(f"DEBUG: update_data keys before pop: {list(update_data.keys())}")
        logger.info(f"DEBUG: quote_update.create_folder attribute: {getattr(quote_update, 'create_folder', 'NOT_SET')}")
        # Convert any Decimal fields to strings
        for key, value in update_data.items():
            if isinstance(value, Decimal):
                update_data[key] = str(value)
        
        update_data["updated_at"] = datetime.now().isoformat()
        
        # If line items are being updated, recalculate totals
        line_items = current_quote.get("line_items", [])
        if update_data.get("tax_rate") is not None or "line_items" in update_data:
            if "line_items" in update_data:
                line_items = update_data["line_items"]
            
            # Recalculate totals
            tax_rate = Decimal(update_data.get("tax_rate", current_quote.get("tax_rate", 0)))
            totals = calculate_quote_totals(line_items, tax_rate, "after_discount")
            update_data.update(totals)
        
        # Create version before updating
        try:
            # Get latest version number
            versions_response = supabase_storage.table("quote_versions").select("version_number").eq("quote_id", quote_id).order("version_number", desc=True).limit(1).execute()
            next_version = 1
            if versions_response.data:
                next_version = versions_response.data[0].get("version_number", 0) + 1
            
            # Create version record
            version_data = {
                "quote_id": quote_id,
                "version_number": next_version,
                "title": current_quote.get("title"),
                "client_id": current_quote.get("client_id"),
                "notes": current_quote.get("notes"),
                "terms": current_quote.get("terms"),
                "expiration_date": current_quote.get("expiration_date"),
                "tax_rate": str(current_quote.get("tax_rate", 0)),
                "currency": current_quote.get("currency", "USD"),
                "status": current_quote.get("status"),
                "subtotal": str(current_quote.get("subtotal", 0)),
                "tax_amount": str(current_quote.get("tax_amount", 0)),
                "total": str(current_quote.get("total", 0)),
                "line_items": line_items,
                "changed_by": current_admin.get("id"),
                "change_description": "Quote updated"
            }
            supabase_storage.table("quote_versions").insert(version_data).execute()
        except Exception as e:
            print(f"Warning: Failed to create version: {str(e)}")
        
        # Handle folder creation if requested and quote doesn't have one
        folder_id = current_quote.get("folder_id")
        logger.info(f"DEBUG: Checking folder creation conditions:")
        logger.info(f"  - hasattr(quote_update, 'create_folder'): {hasattr(quote_update, 'create_folder')}")
        logger.info(f"  - quote_update.create_folder: {getattr(quote_update, 'create_folder', None)}")
        logger.info(f"  - current_quote folder_id: {folder_id}")
        logger.info(f"  - update_data keys: {list(update_data.keys())}")
        logger.info(f"  - update_data.get('create_folder'): {update_data.get('create_folder')}")
        
        # Check both the model attribute and the extracted value
        create_folder_requested = (
            (hasattr(quote_update, 'create_folder') and quote_update.create_folder is True) or
            create_folder_value is True
        )
        logger.info(f"DEBUG: create_folder_requested: {create_folder_requested}")
        
        if create_folder_requested and not folder_id:
            try:
                logger.info(f"Creating folder for existing quote {quote_id}")
                # Generate folder name from quote
                quote_number = current_quote.get("quote_number", quote_id[:8])
                folder_name = f"Order - {current_quote.get('title') or quote_number}"
                if current_quote.get("client_id"):
                    # Get client name for folder - use service role client to bypass RLS
                    try:
                        client_response = supabase_storage.table("clients").select("name, company").eq("id", current_quote.get("client_id")).single().execute()
                        if client_response.data:
                            client_name = client_response.data.get("company") or client_response.data.get("name") or "Client"
                            folder_name = f"{client_name} - {current_quote.get('title') or quote_number}"
                    except Exception as e:
                        logger.warning(f"Could not fetch client name: {str(e)}")
                
                folder_data = {
                    "id": str(uuid.uuid4()),
                    "name": folder_name,
                    "description": f"Folder for quote {quote_number}",
                    "quote_id": quote_id,
                    "client_id": current_quote.get("client_id"),
                    "status": "active",
                    "created_by": current_admin["id"],
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }
                
                logger.info(f"Inserting folder with data: {folder_data}")
                # Use service role client to bypass RLS
                folder_response = supabase_storage.table("folders").insert(folder_data).execute()
                if folder_response.data and len(folder_response.data) > 0:
                    folder_id = folder_response.data[0]["id"]
                    logger.info(f"Folder created successfully with ID: {folder_id}")
                    # Add folder_id to update_data so it gets saved in the main update
                    update_data["folder_id"] = folder_id
                    logger.info(f"Added folder_id {folder_id} to update_data")
                    
                    # Assign folder to client if client_id exists
                    if current_quote.get("client_id"):
                        try:
                            # Check if client has a user account
                            client_user_response = supabase_storage.table("user_roles").select("user_id").eq("user_id", current_quote.get("client_id")).limit(1).execute()
                            # If client has a user account, assign folder to them
                            # Note: This assumes client_id matches user_id for client accounts
                            # You may need to adjust this based on your user/client relationship
                            assignment_data = {
                                "folder_id": folder_id,
                                "user_id": current_quote.get("client_id"),
                                "role": "viewer",
                                "assigned_by": current_admin["id"],
                                "assigned_at": datetime.now().isoformat()
                            }
                            supabase_storage.table("folder_assignments").insert(assignment_data).execute()
                            logger.info(f"Folder assigned to client: {current_quote.get('client_id')}")
                        except Exception as e:
                            logger.warning(f"Failed to assign folder to client: {str(e)}")
                else:
                    logger.error(f"Folder creation response was empty or invalid")
            except Exception as e:
                import traceback
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error: Failed to create folder for quote: {str(e)}")
                logger.error(traceback.format_exc())
                # Don't fail the quote update if folder creation fails
        
        # Update quote - use service role client to ensure folder_id is properly saved
        response = supabase_storage.table("quotes").update(update_data).eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Log status change activity
        new_status = update_data.get("status")
        if new_status and new_status != old_status:
            log_quote_activity(
                quote_id=quote_id,
                activity_type="status_changed",
                user_id=current_admin.get("id"),
                user_name=current_admin.get("name") or current_admin.get("email"),
                description=f"Status changed from {old_status} to {new_status}",
                metadata={"old_status": old_status, "new_status": new_status}
            )
        else:
            # Log general update
            log_quote_activity(
                quote_id=quote_id,
                activity_type="updated",
                user_id=current_admin.get("id"),
                user_name=current_admin.get("name") or current_admin.get("email"),
                description="Quote updated" + (f" with folder" if folder_id else "")
            )
        
        # Fetch complete quote with relations - use service role client to ensure folder_id is included
        response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found after update")
        
        updated_quote = response.data[0]
        
        # If folder was created but folder_id is not in the response, verify it exists
        if folder_id and not updated_quote.get("folder_id"):
            print(f"Warning: Folder {folder_id} was created but not found in quote response. Verifying...")
            # Verify folder exists
            folder_check = supabase_storage.table("folders").select("id").eq("id", folder_id).execute()
            if folder_check.data:
                print(f"Folder {folder_id} exists. Updating quote again with folder_id...")
                # Update quote again with folder_id
                supabase_storage.table("quotes").update({"folder_id": folder_id}).eq("id", quote_id).execute()
                # Fetch again
                response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
                if response.data:
                    updated_quote = response.data[0]
        
        logger.info(f"Returning updated quote with folder_id: {updated_quote.get('folder_id')}")
        logger.info(f"Full quote data keys: {list(updated_quote.keys())}")
        return updated_quote
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error in update_quote: {str(e)}")
        logger.error(traceback.format_exc())
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

# Bulk action endpoints
from pydantic import BaseModel as PydanticBaseModel

class BulkDeleteRequest(PydanticBaseModel):
    quote_ids: List[str]

class BulkStatusUpdateRequest(PydanticBaseModel):
    quote_ids: List[str]
    status: str

class BulkAssignRequest(PydanticBaseModel):
    quote_ids: List[str]
    user_ids: List[str]

@router.post("/bulk/delete")
async def bulk_delete_quotes(request: BulkDeleteRequest, current_admin: dict = Depends(get_current_admin)):
    """Bulk delete quotes (admin only)"""
    try:
        if not request.quote_ids:
            raise HTTPException(status_code=400, detail="No quote IDs provided")
        
        # Delete line items first
        supabase.table("line_items").delete().in_("quote_id", request.quote_ids).execute()
        
        # Delete quotes
        response = supabase.table("quotes").delete().in_("id", request.quote_ids).execute()
        
        return {"message": f"Deleted {len(response.data)} quote(s) successfully", "deleted_count": len(response.data)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk/update-status")
async def bulk_update_status(request: BulkStatusUpdateRequest, current_admin: dict = Depends(get_current_admin)):
    """Bulk update quote status (admin only)"""
    try:
        if not request.quote_ids:
            raise HTTPException(status_code=400, detail="No quote IDs provided")
        
        valid_statuses = {"draft", "sent", "viewed", "accepted", "declined"}
        if request.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}")
        
        update_data = {
            "status": request.status,
            "updated_at": datetime.now().isoformat()
        }
        
        response = supabase.table("quotes").update(update_data).in_("id", request.quote_ids).execute()
        
        return {"message": f"Updated {len(response.data)} quote(s) successfully", "updated_count": len(response.data)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk/assign")
async def bulk_assign_quotes(request: BulkAssignRequest, current_admin: dict = Depends(get_current_admin)):
    """Bulk assign quotes to users (admin only)"""
    try:
        if not request.quote_ids:
            raise HTTPException(status_code=400, detail="No quote IDs provided")
        if not request.user_ids:
            raise HTTPException(status_code=400, detail="No user IDs provided")
        
        # Get admin name for assignment tracking
        admin_name = current_admin.get("name") or current_admin.get("email", "Admin")
        
        assignments_to_create = []
        for quote_id in request.quote_ids:
            for user_id in request.user_ids:
                # Check if assignment already exists
                existing = supabase_storage.table("quote_assignments").select("id").eq("quote_id", quote_id).eq("user_id", user_id).execute()
                if not existing.data:
                    assignments_to_create.append({
                        "quote_id": quote_id,
                        "user_id": user_id,
                        "assigned_by": admin_name,
                        "assigned_at": datetime.now().isoformat()
                    })
        
        if assignments_to_create:
            supabase_storage.table("quote_assignments").insert(assignments_to_create).execute()
        
        # Send email notifications
        for assignment in assignments_to_create:
            try:
                # Get quote info
                quote_response = supabase.table("quotes").select("title, quote_number").eq("id", assignment["quote_id"]).execute()
                if quote_response.data:
                    quote = quote_response.data[0]
                    quote_title = quote.get("title", "Quote")
                    quote_number = quote.get("quote_number", "")
                    
                    # Get user email
                    if supabase_service_role_key:
                        auth_url = f"{supabase_url}/auth/v1/admin/users/{assignment['user_id']}"
                        headers = {
                            "apikey": supabase_service_role_key,
                            "Authorization": f"Bearer {supabase_service_role_key}",
                            "Content-Type": "application/json"
                        }
                        user_response = requests.get(auth_url, headers=headers, timeout=10)
                        if user_response.status_code == 200:
                            user_data = user_response.json()
                            user_email = user_data.get("email")
                            user_metadata = user_data.get("user_metadata", {})
                            user_name = user_metadata.get("name")
                            
                            if user_email:
                                email_service.send_quote_assignment_notification(
                                    to_email=user_email,
                                    quote_title=quote_title,
                                    quote_number=quote_number,
                                    quote_id=assignment["quote_id"],
                                    user_name=user_name,
                                    assigned_by=admin_name
                                )
            except Exception as e:
                print(f"Warning: Failed to send email notification for assignment: {str(e)}")
        
        return {"message": f"Assigned {len(assignments_to_create)} quote(s) successfully", "assigned_count": len(assignments_to_create)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Helper function to log activity
def log_quote_activity(
    quote_id: str,
    activity_type: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    user_email: Optional[str] = None,
    description: Optional[str] = None,
    metadata: Optional[dict] = None
):
    """Log an activity for a quote"""
    try:
        activity_data = {
            "quote_id": quote_id,
            "activity_type": activity_type,
            "description": description,
            "metadata": metadata or {}
        }
        if user_id:
            activity_data["user_id"] = user_id
        if user_name:
            activity_data["user_name"] = user_name
        if user_email:
            activity_data["user_email"] = user_email
        
        supabase_storage.table("quote_activities").insert(activity_data).execute()
    except Exception as e:
        print(f"Warning: Failed to log activity: {str(e)}")

# Send quote via email
class SendQuoteEmailRequest(PydanticBaseModel):
    to_email: str
    custom_message: Optional[str] = None
    include_pdf: bool = False

@router.post("/{quote_id}/send-email")
async def send_quote_email(
    quote_id: str,
    request: SendQuoteEmailRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """Send quote via email (admin only)"""
    try:
        # Get quote
        response = supabase.table("quotes").select("*, clients(*)").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote = response.data[0]
        client = quote.get("clients", {})
        
        # Generate share link if needed
        share_link = None
        if quote.get("share_token"):
            share_link = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/share/quote/{quote.get('share_token')}"
        
        # Generate PDF URL if requested
        pdf_url = None
        if request.include_pdf:
            pdf_url = f"{os.getenv('BACKEND_URL', 'http://localhost:8000')}/api/pdf/quote/{quote_id}"
        
        # Send email
        sender_name = current_admin.get("name") or current_admin.get("email", "Admin")
        success = email_service.send_quote_email(
            to_email=request.to_email,
            quote_title=quote.get("title", "Quote"),
            quote_number=quote.get("quote_number", ""),
            quote_id=quote_id,
            share_link=share_link,
            pdf_url=pdf_url,
            customer_name=client.get("name"),
            sender_name=sender_name,
            custom_message=request.custom_message
        )
        
        if success:
            # Log activity
            log_quote_activity(
                quote_id=quote_id,
                activity_type="sent",
                user_id=current_admin.get("id"),
                user_name=sender_name,
                user_email=current_admin.get("email"),
                description=f"Quote sent via email to {request.to_email}"
            )
            return {"message": "Quote sent successfully", "sent": True}
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Share link endpoints
class CreateShareLinkRequest(PydanticBaseModel):
    expires_at: Optional[str] = None  # ISO format datetime
    max_views: Optional[int] = None

@router.post("/{quote_id}/share-link")
async def create_share_link(
    quote_id: str,
    request: CreateShareLinkRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """Create a shareable link for a quote (admin only)"""
    try:
        # Generate unique token
        share_token = str(uuid.uuid4())
        
        # Create share link record
        share_link_data = {
            "quote_id": quote_id,
            "share_token": share_token,
            "created_by": current_admin.get("id"),
            "is_active": True
        }
        if request.expires_at:
            share_link_data["expires_at"] = request.expires_at
        if request.max_views:
            share_link_data["max_views"] = request.max_views
        
        supabase_storage.table("quote_share_links").insert(share_link_data).execute()
        
        # Update quote with share token
        supabase.table("quotes").update({"share_token": share_token}).eq("id", quote_id).execute()
        
        share_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/share/quote/{share_token}"
        
        # Log activity
        log_quote_activity(
            quote_id=quote_id,
            activity_type="share_link_created",
            user_id=current_admin.get("id"),
            user_name=current_admin.get("name") or current_admin.get("email"),
            description="Share link created"
        )
        
        return {"share_token": share_token, "share_url": share_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{quote_id}/share-link")
async def get_share_link(
    quote_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get share link for a quote (admin only)"""
    try:
        response = supabase_storage.table("quote_share_links").select("*").eq("quote_id", quote_id).eq("is_active", True).order("created_at", desc=True).limit(1).execute()
        if response.data:
            share_link = response.data[0]
            share_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/share/quote/{share_link['share_token']}"
            return {"share_token": share_link["share_token"], "share_url": share_url, **share_link}
        return {"share_token": None, "share_url": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Activity timeline endpoints
@router.get("/{quote_id}/activities")
async def get_quote_activities(
    quote_id: str,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get activity timeline for a quote"""
    try:
        response = supabase_storage.table("quote_activities").select("*").eq("quote_id", quote_id).order("created_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Comments endpoints
class CreateCommentRequest(PydanticBaseModel):
    comment: str
    is_internal: bool = True

@router.post("/{quote_id}/comments")
async def create_comment(
    quote_id: str,
    request: CreateCommentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a comment on a quote"""
    try:
        comment_data = {
            "quote_id": quote_id,
            "user_id": current_user.get("id"),
            "user_name": current_user.get("name") or current_user.get("email"),
            "user_email": current_user.get("email"),
            "comment": request.comment,
            "is_internal": request.is_internal
        }
        
        response = supabase_storage.table("quote_comments").insert(comment_data).execute()
        
        # Log activity
        log_quote_activity(
            quote_id=quote_id,
            activity_type="commented",
            user_id=current_user.get("id"),
            user_name=current_user.get("name") or current_user.get("email"),
            description="Comment added"
        )
        
        return response.data[0] if response.data else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{quote_id}/comments")
async def get_quote_comments(
    quote_id: str,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get comments for a quote"""
    try:
        # If customer, only show non-internal comments
        query = supabase_storage.table("quote_comments").select("*").eq("quote_id", quote_id)
        if current_user and current_user.get("role") != "admin":
            query = query.eq("is_internal", False)
        
        response = query.order("created_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Version history endpoints
@router.get("/{quote_id}/versions")
async def get_quote_versions(
    quote_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get version history for a quote (admin only)"""
    try:
        response = supabase_storage.table("quote_versions").select("*").eq("quote_id", quote_id).order("version_number", desc=True).execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Reminder endpoints
class SetReminderRequest(PydanticBaseModel):
    reminder_date: str  # ISO format datetime

@router.post("/{quote_id}/reminder")
async def set_reminder(
    quote_id: str,
    request: SetReminderRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """Set a reminder for a quote (admin only)"""
    try:
        supabase.table("quotes").update({
            "reminder_date": request.reminder_date,
            "reminder_sent": False
        }).eq("id", quote_id).execute()
        
        return {"message": "Reminder set successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{quote_id}/reminder")
async def delete_reminder(
    quote_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete reminder for a quote (admin only)"""
    try:
        supabase.table("quotes").update({
            "reminder_date": None,
            "reminder_sent": False
        }).eq("id", quote_id).execute()
        
        return {"message": "Reminder deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Quote templates have been removed

# Line item templates and categories have been removed

# Auto-save endpoint
class AutoSaveRequest(PydanticBaseModel):
    draft_data: dict

@router.post("/{quote_id}/auto-save")
async def auto_save_quote(
    quote_id: str,
    request: AutoSaveRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """Auto-save a quote draft (admin only)"""
    try:
        supabase.table("quotes").update({
            "draft_auto_save": request.draft_data,
            "last_auto_saved_at": datetime.now().isoformat()
        }).eq("id", quote_id).execute()
        
        return {"message": "Draft auto-saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{quote_id}/auto-save")
async def get_auto_saved_draft(
    quote_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get auto-saved draft for a quote (admin only)"""
    try:
        response = supabase.table("quotes").select("draft_auto_save, last_auto_saved_at").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        return {
            "draft_data": response.data[0].get("draft_auto_save"),
            "last_auto_saved_at": response.data[0].get("last_auto_saved_at")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Client quote history endpoint
@router.get("/client/{client_id}/history")
async def get_client_quote_history(
    client_id: str,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Get quote history for a specific client"""
    try:
        query = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("client_id", client_id)
        
        # If customer, only show assigned quotes
        if current_user and current_user.get("role") == "customer":
            assignments_response = supabase_storage.table("quote_assignments").select("quote_id").eq("user_id", current_user["id"]).execute()
            assigned_quote_ids = [a["quote_id"] for a in (assignments_response.data or [])]
            if assigned_quote_ids:
                query = query.in_("id", assigned_quote_ids)
            else:
                return []
        
        response = query.order("created_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Analytics endpoints
@router.get("/analytics/summary")
async def get_quote_analytics(
    current_admin: dict = Depends(get_current_admin),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """Get quote analytics summary (admin only)"""
    try:
        query = supabase.table("quotes").select("*")
        
        if start_date:
            try:
                start = datetime.strptime(start_date, "%Y-%m-%d")
                query = query.gte("created_at", start.isoformat())
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
        
        if end_date:
            try:
                end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
                query = query.lt("created_at", end.isoformat())
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
        
        response = query.execute()
        quotes = response.data or []
        
        total_quotes = len(quotes)
        total_value = sum(Decimal(q.get("total", "0")) for q in quotes)
        accepted_quotes = [q for q in quotes if q.get("status") == "accepted"]
        accepted_value = sum(Decimal(q.get("total", "0")) for q in accepted_quotes)
        conversion_rate = (len(accepted_quotes) / total_quotes * 100) if total_quotes > 0 else 0
        
        status_counts = {}
        for quote in quotes:
            status = quote.get("status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        payment_status_counts = {}
        for quote in quotes:
            payment_status = quote.get("payment_status") or "unpaid"
            payment_status_counts[payment_status] = payment_status_counts.get(payment_status, 0) + 1
        
        return {
            "total_quotes": total_quotes,
            "total_value": str(total_value),
            "accepted_quotes": len(accepted_quotes),
            "accepted_value": str(accepted_value),
            "conversion_rate": round(conversion_rate, 2),
            "average_quote_value": str(total_value / total_quotes) if total_quotes > 0 else "0",
            "status_counts": status_counts,
            "payment_status_counts": payment_status_counts,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

