from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stripe_service import StripeService
from database import supabase
import stripe
import json
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/stripe", tags=["stripe"])

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
    """Handle Stripe webhook events"""
    try:
        body = await request.body()
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        
        if not webhook_secret:
            raise HTTPException(status_code=500, detail="Webhook secret not configured")
        
        # Verify webhook signature
        try:
            event = stripe.Webhook.construct_event(
                body, stripe_signature, webhook_secret
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Handle different event types
        event_type = event["type"]
        data = event["data"]["object"]
        
        if event_type == "invoice.paid":
            # Update quote payment status when invoice is paid
            invoice_id = data["id"]
            quote_response = supabase.table("quotes").select("id").eq("stripe_invoice_id", invoice_id).execute()
            if quote_response.data:
                quote_id = quote_response.data[0]["id"]
                supabase.table("quotes").update({
                    "payment_status": "paid",
                    "status": "accepted"
                }).eq("id", quote_id).execute()
        
        elif event_type == "invoice.payment_failed":
            # Update quote payment status when payment fails
            invoice_id = data["id"]
            quote_response = supabase.table("quotes").select("id").eq("stripe_invoice_id", invoice_id).execute()
            if quote_response.data:
                quote_id = quote_response.data[0]["id"]
                supabase.table("quotes").update({
                    "payment_status": "failed"
                }).eq("id", quote_id).execute()
        
        elif event_type == "invoice.finalized":
            # Invoice was finalized
            invoice_id = data["id"]
            quote_response = supabase.table("quotes").select("id").eq("stripe_invoice_id", invoice_id).execute()
            if quote_response.data:
                quote_id = quote_response.data[0]["id"]
                supabase.table("quotes").update({
                    "payment_status": "unpaid"
                }).eq("id", quote_id).execute()
        
        return {"status": "success"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

