import stripe
import os
from typing import Optional, Dict, Any
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

if not stripe.api_key:
    raise ValueError("STRIPE_SECRET_KEY environment variable is required")

class StripeService:
    """Service for interacting with Stripe API"""
    
    @staticmethod
    def create_or_get_customer(client_data: Dict[str, Any], existing_stripe_id: Optional[str] = None) -> str:
        """
        Create a Stripe customer or return existing one
        Returns the Stripe customer ID
        """
        if existing_stripe_id:
            try:
                # Verify customer exists
                stripe.Customer.retrieve(existing_stripe_id)
                return existing_stripe_id
            except stripe.error.InvalidRequestError:
                # Customer doesn't exist, create new one
                pass
        
        customer_params = {
            "name": client_data.get("name"),
            "email": client_data.get("email"),
            "phone": client_data.get("phone"),
            "metadata": {
                "client_id": client_data.get("id"),
                "company": client_data.get("company", ""),
            }
        }
        
        # Remove None values
        customer_params = {k: v for k, v in customer_params.items() if v is not None}
        
        customer = stripe.Customer.create(**customer_params)
        return customer.id
    
    @staticmethod
    def create_invoice_from_quote(
        quote_data: Dict[str, Any],
        line_items: list,
        customer_id: str,
        quote_number: str
    ) -> Dict[str, Any]:
        """
        Create a Stripe invoice from a quote
        Returns invoice data including invoice ID and hosted invoice URL
        """
        # Convert amounts to cents (Stripe uses smallest currency unit)
        total_cents = int(float(quote_data.get("total", 0)) * 100)
        subtotal_cents = int(float(quote_data.get("subtotal", 0)) * 100)
        tax_cents = int(float(quote_data.get("tax_amount", 0)) * 100)
        
        # Create invoice items for each line item
        invoice_items = []
        for item in line_items:
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            discount_percent = float(item.get("discount_percent", 0) or 0)
            
            # Calculate line item total
            subtotal = quantity * unit_price
            discount_amount = subtotal * (discount_percent / 100)
            line_total = subtotal - discount_amount
            
            # Create invoice item
            invoice_item = stripe.InvoiceItem.create(
                customer=customer_id,
                amount=int(line_total * 100),  # Convert to cents
                currency=quote_data.get("currency", "usd").lower(),
                description=item.get("description", "Line item"),
                metadata={
                    "quote_id": quote_data.get("id"),
                    "line_item_id": item.get("id"),
                }
            )
            invoice_items.append(invoice_item.id)
        
        # Add tax as a separate line item if applicable
        if tax_cents > 0:
            stripe.InvoiceItem.create(
                customer=customer_id,
                amount=tax_cents,
                currency=quote_data.get("currency", "usd").lower(),
                description=f"Tax ({quote_data.get('tax_rate', 0)}%)",
                metadata={
                    "quote_id": quote_data.get("id"),
                    "type": "tax",
                }
            )
        
        # Create the invoice
        invoice = stripe.Invoice.create(
            customer=customer_id,
            auto_advance=True,  # Automatically finalize and attempt payment
            collection_method="send_invoice",  # Send invoice to customer
            days_until_due=30,  # Payment due in 30 days
            description=f"Invoice for Quote {quote_number}",
            metadata={
                "quote_id": quote_data.get("id"),
                "quote_number": quote_number,
            }
        )
        
        # Finalize the invoice
        invoice = stripe.Invoice.finalize_invoice(invoice.id)
        
        return {
            "invoice_id": invoice.id,
            "invoice_url": invoice.hosted_invoice_url,
            "invoice_pdf": invoice.invoice_pdf,
            "status": invoice.status,
        }
    
    @staticmethod
    def get_invoice(invoice_id: str) -> Dict[str, Any]:
        """Retrieve invoice details from Stripe"""
        invoice = stripe.Invoice.retrieve(invoice_id)
        return {
            "id": invoice.id,
            "status": invoice.status,
            "amount_due": invoice.amount_due / 100,  # Convert from cents
            "amount_paid": invoice.amount_paid / 100,
            "hosted_invoice_url": invoice.hosted_invoice_url,
            "invoice_pdf": invoice.invoice_pdf,
            "paid": invoice.paid,
        }
    
    @staticmethod
    def create_payment_intent(amount: Decimal, currency: str, customer_id: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Create a payment intent for immediate payment"""
        intent = stripe.PaymentIntent.create(
            amount=int(float(amount) * 100),  # Convert to cents
            currency=currency.lower(),
            customer=customer_id,
            metadata=metadata,
            automatic_payment_methods={
                "enabled": True,
            }
        )
        return {
            "client_secret": intent.client_secret,
            "payment_intent_id": intent.id,
        }

