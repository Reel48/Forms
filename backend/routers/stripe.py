from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional, Dict, Any
import sys
import os
import json
import logging
from datetime import datetime
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stripe_service import StripeService
from database import supabase
import stripe
from dotenv import load_dotenv

load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stripe", tags=["stripe"])

def store_webhook_event(
    stripe_event_id: str,
    event_type: str,
    event_data: Dict[str, Any],
    processing_status: str = "pending",
    error_message: Optional[str] = None,
    quote_id: Optional[str] = None,
    invoice_id: Optional[str] = None
) -> str:
    """Store webhook event in database for audit trail and idempotency"""
    try:
        event_record = {
            "stripe_event_id": stripe_event_id,
            "event_type": event_type,
            "event_data": json.dumps(event_data),
            "processing_status": processing_status,
            "error_message": error_message,
            "quote_id": quote_id,
            "invoice_id": invoice_id,
        }
        
        # Try to insert, but handle duplicate key error (idempotency)
        try:
            response = supabase.table("webhook_events").insert(event_record).execute()
            if response.data:
                return response.data[0]["id"]
        except Exception as e:
            # If event already exists, update it
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                logger.info(f"Event {stripe_event_id} already exists, updating status")
                update_response = supabase.table("webhook_events").update({
                    "processing_status": processing_status,
                    "error_message": error_message,
                    "processed_at": datetime.now().isoformat() if processing_status in ["completed", "failed"] else None
                }).eq("stripe_event_id", stripe_event_id).execute()
                if update_response.data:
                    return update_response.data[0]["id"]
            raise
        
        return None
    except Exception as e:
        logger.error(f"Failed to store webhook event: {str(e)}")
        # Don't fail the webhook if we can't store it
        return None

def check_event_processed(stripe_event_id: str) -> bool:
    """Check if webhook event has already been processed (idempotency check)"""
    try:
        response = supabase.table("webhook_events").select("processing_status").eq("stripe_event_id", stripe_event_id).execute()
        if response.data:
            status = response.data[0].get("processing_status")
            return status == "completed"
        return False
    except Exception as e:
        logger.error(f"Failed to check event processing status: {str(e)}")
        return False

def update_event_status(
    stripe_event_id: str,
    status: str,
    error_message: Optional[str] = None,
    quote_id: Optional[str] = None
):
    """Update webhook event processing status"""
    try:
        update_data = {
            "processing_status": status,
            "processed_at": datetime.now().isoformat() if status in ["completed", "failed"] else None,
        }
        if error_message:
            update_data["error_message"] = error_message
        if quote_id:
            update_data["quote_id"] = quote_id
        
        supabase.table("webhook_events").update(update_data).eq("stripe_event_id", stripe_event_id).execute()
    except Exception as e:
        logger.error(f"Failed to update event status: {str(e)}")

def handle_invoice_event(event_type: str, invoice_data: Dict[str, Any]) -> Optional[str]:
    """Handle invoice-related webhook events and return quote_id if found"""
    invoice_id = invoice_data.get("id")
    quote_id = None
    
    # Find quote by invoice ID
    try:
        quote_response = supabase.table("quotes").select("id, payment_status, status").eq("stripe_invoice_id", invoice_id).execute()
        if not quote_response.data:
            logger.warning(f"No quote found for invoice {invoice_id}")
            return None
        
        quote_id = quote_response.data[0]["id"]
        current_status = quote_response.data[0].get("status")
        current_payment_status = quote_response.data[0].get("payment_status")
        
        update_data = {"updated_at": datetime.now().isoformat()}
        
        # Handle different invoice event types
        if event_type == "invoice.paid":
            update_data.update({
                "payment_status": "paid",
                "status": "accepted"  # Keep as accepted when paid
            })
            logger.info(f"Invoice {invoice_id} paid for quote {quote_id}")
            
        elif event_type == "invoice.payment_failed":
            update_data["payment_status"] = "failed"
            logger.info(f"Payment failed for invoice {invoice_id}, quote {quote_id}")
            
        elif event_type == "invoice.finalized":
            # Invoice was finalized (ready for payment)
            update_data["payment_status"] = "unpaid"
            logger.info(f"Invoice {invoice_id} finalized for quote {quote_id}")
            
        elif event_type == "invoice.updated":
            # Invoice details were updated
            # Sync payment status from Stripe
            paid = invoice_data.get("paid", False)
            status = invoice_data.get("status", "")
            
            if paid:
                update_data["payment_status"] = "paid"
            elif status == "open":
                update_data["payment_status"] = "unpaid"
            elif status == "void":
                update_data["payment_status"] = "voided"
            elif status == "uncollectible":
                update_data["payment_status"] = "uncollectible"
            
            logger.info(f"Invoice {invoice_id} updated for quote {quote_id}, status: {status}")
            
        elif event_type == "invoice.voided":
            update_data["payment_status"] = "voided"
            logger.info(f"Invoice {invoice_id} voided for quote {quote_id}")
            
        elif event_type == "invoice.marked_uncollectible":
            update_data["payment_status"] = "uncollectible"
            logger.info(f"Invoice {invoice_id} marked uncollectible for quote {quote_id}")
            
        elif event_type == "invoice.sent":
            # Invoice was sent to customer
            logger.info(f"Invoice {invoice_id} sent to customer for quote {quote_id}")
            # No status change needed, just log it
            
        elif event_type == "invoice.payment_action_required":
            # Payment requires customer action (e.g., 3D Secure)
            update_data["payment_status"] = "action_required"
            logger.info(f"Payment action required for invoice {invoice_id}, quote {quote_id}")
            
        elif event_type == "invoice.upcoming":
            # Upcoming invoice (mainly for subscriptions)
            logger.info(f"Upcoming invoice {invoice_id} for quote {quote_id}")
            # No status change needed
        
        # Update quote if we have changes
        if update_data:
            supabase.table("quotes").update(update_data).eq("id", quote_id).execute()
        
        return quote_id
        
    except Exception as e:
        logger.error(f"Error handling invoice event {event_type} for invoice {invoice_id}: {str(e)}")
        raise

@router.post("/quotes/{quote_id}/create-invoice")
async def create_invoice_from_quote(quote_id: str):
    """Create a Stripe invoice from an accepted quote"""
    try:
        # Fetch quote with client and line items
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote = response.data[0]
        
        # Check if quote is already accepted
        if quote.get("status") != "accepted":
            raise HTTPException(status_code=400, detail="Quote must be accepted before creating invoice")
        
        # Check if invoice already exists
        if quote.get("stripe_invoice_id"):
            # Return existing invoice
            invoice_data = StripeService.get_invoice(quote.get("stripe_invoice_id"))
            return {
                "invoice_id": invoice_data["id"],
                "invoice_url": invoice_data["hosted_invoice_url"],
                "invoice_pdf": invoice_data["invoice_pdf"],
                "status": invoice_data["status"],
            }
        
        # Get or create Stripe customer
        client = quote.get("clients")
        if not client:
            raise HTTPException(status_code=400, detail="Quote must have an associated client")
        
        customer_id = StripeService.create_or_get_customer(
            client,
            client.get("stripe_customer_id")
        )
        
        # Update client with Stripe customer ID if not set
        if not client.get("stripe_customer_id"):
            supabase.table("clients").update({
                "stripe_customer_id": customer_id
            }).eq("id", client["id"]).execute()
        
        # Create invoice
        invoice_data = StripeService.create_invoice_from_quote(
            quote,
            quote.get("line_items", []),
            customer_id,
            quote.get("quote_number")
        )
        
        # Update quote with invoice information
        supabase.table("quotes").update({
            "stripe_invoice_id": invoice_data["invoice_id"],
            "payment_status": "unpaid",
            "status": "accepted"
        }).eq("id", quote_id).execute()
        
        return invoice_data
        
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str):
    """Get invoice details from Stripe"""
    try:
        invoice_data = StripeService.get_invoice(invoice_id)
        return invoice_data
    except stripe.error.InvalidRequestError:
        raise HTTPException(status_code=404, detail="Invoice not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature")
):
    """
    Enhanced Stripe webhook handler with idempotency, comprehensive event handling, and audit trail
    
    Handles the following invoice events:
    - invoice.paid
    - invoice.payment_failed
    - invoice.finalized
    - invoice.updated
    - invoice.voided
    - invoice.marked_uncollectible
    - invoice.sent
    - invoice.payment_action_required
    - invoice.upcoming
    """
    stripe_event_id = None
    event_type = None
    
    try:
        body = await request.body()
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        
        # Allow webhook to work without secret for testing (not recommended for production)
        if not webhook_secret:
            logger.warning("STRIPE_WEBHOOK_SECRET not configured - webhook signature verification disabled")
            # For development/testing, parse event without verification
            try:
                event = json.loads(body.decode('utf-8'))
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON payload")
        else:
            # Verify webhook signature
            try:
                event = stripe.Webhook.construct_event(
                    body, stripe_signature, webhook_secret
                )
            except ValueError as e:
                logger.error(f"Invalid webhook payload: {str(e)}")
                raise HTTPException(status_code=400, detail="Invalid payload")
            except stripe.error.SignatureVerificationError as e:
                logger.error(f"Invalid webhook signature: {str(e)}")
                raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Extract event information
        stripe_event_id = event.get("id")
        event_type = event.get("type")
        event_data = event.get("data", {}).get("object", {})
        
        logger.info(f"Received webhook event: {event_type} (ID: {stripe_event_id})")
        
        # Idempotency check - skip if already processed
        if stripe_event_id and check_event_processed(stripe_event_id):
            logger.info(f"Event {stripe_event_id} already processed, skipping")
            return {"status": "success", "message": "Event already processed"}
        
        # Store event in database (for audit trail and idempotency)
        invoice_id = event_data.get("id") if event_data.get("object") == "invoice" else None
        store_webhook_event(
            stripe_event_id=stripe_event_id or "unknown",
            event_type=event_type or "unknown",
            event_data=event_data,
            processing_status="processing",
            invoice_id=invoice_id
        )
        
        # Handle invoice-related events
        quote_id = None
        if event_type and event_type.startswith("invoice."):
            if event_data.get("object") == "invoice":
                quote_id = handle_invoice_event(event_type, event_data)
            else:
                logger.warning(f"Event {event_type} does not contain invoice object")
        
        # Update event status to completed
        if stripe_event_id:
            update_event_status(
                stripe_event_id=stripe_event_id,
                status="completed",
                quote_id=quote_id
            )
        
        logger.info(f"Successfully processed webhook event {event_type} (ID: {stripe_event_id})")
        return {
            "status": "success",
            "event_id": stripe_event_id,
            "event_type": event_type,
            "quote_id": quote_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_message = str(e)
        logger.error(f"Error processing webhook event {event_type} (ID: {stripe_event_id}): {error_message}")
        
        # Update event status to failed
        if stripe_event_id:
            update_event_status(
                stripe_event_id=stripe_event_id,
                status="failed",
                error_message=error_message
            )
        
        # Return 200 to Stripe to prevent retries for non-recoverable errors
        # For recoverable errors, you might want to return 500
        return {
            "status": "error",
            "message": error_message,
            "event_id": stripe_event_id
        }

@router.get("/webhook-events")
async def get_webhook_events(
    limit: int = 50,
    event_type: Optional[str] = None,
    status: Optional[str] = None
):
    """Get webhook events for debugging and monitoring"""
    try:
        query = supabase.table("webhook_events").select("*").order("created_at", desc=True).limit(limit)
        
        if event_type:
            query = query.eq("event_type", event_type)
        if status:
            query = query.eq("processing_status", status)
        
        response = query.execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching webhook events: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/webhook-events/{event_id}")
async def get_webhook_event(event_id: str):
    """Get a specific webhook event by Stripe event ID"""
    try:
        response = supabase.table("webhook_events").select("*").eq("stripe_event_id", event_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Webhook event not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching webhook event: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
