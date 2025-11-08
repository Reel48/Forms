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
    def format_address_for_stripe(client_data: Dict[str, Any]) -> Optional[Dict[str, str]]:
        """
        Format client address for Stripe customer/invoice
        Priority: Structured fields > Parsed text > Text as line1
        """
        # Priority 1: Use structured address fields if complete
        if all([
            client_data.get("address_line1"),
            client_data.get("address_city"),
            client_data.get("address_state"),
            client_data.get("address_postal_code")
        ]):
            address = {
                "line1": client_data["address_line1"],
                "city": client_data["address_city"],
                "state": client_data["address_state"],
                "postal_code": client_data["address_postal_code"],
                "country": client_data.get("address_country", "US")
            }
            # Add line2 if present
            if client_data.get("address_line2"):
                address["line2"] = client_data["address_line2"]
            return address
        
        # Priority 2: Try to parse text address (simple US format)
        text_address = client_data.get("address")
        if text_address:
            # Simple parsing for common US formats
            # Format: "123 Main St, City, ST 12345" or "123 Main St, City, State 12345"
            import re
            # Try to extract components
            # This is a simple parser - can be improved
            parts = [p.strip() for p in text_address.split(',')]
            if len(parts) >= 3:
                # Assume: street, city, state zip
                street = parts[0]
                city = parts[1] if len(parts) > 1 else ""
                state_zip = parts[2] if len(parts) > 2 else ""
                
                # Extract state and zip from "ST 12345" or "State 12345"
                state_zip_match = re.match(r'([A-Z]{2}|[A-Za-z\s]+)\s*(\d{5}(?:-\d{4})?)', state_zip)
                if state_zip_match:
                    state = state_zip_match.group(1).strip()
                    zip_code = state_zip_match.group(2)
                    
                    # If state is more than 2 chars, try to abbreviate or use as-is
                    if len(state) > 2:
                        # Keep full state name (Stripe accepts it)
                        pass
                    
                    return {
                        "line1": street,
                        "city": city,
                        "state": state,
                        "postal_code": zip_code,
                        "country": "US"
                    }
            
            # Priority 3: Fallback - use entire address as line1
            return {
                "line1": text_address,
                "country": client_data.get("address_country", "US")
            }
        
        return None
    
    @staticmethod
    def create_or_get_customer(client_data: Dict[str, Any], existing_stripe_id: Optional[str] = None, update_if_exists: bool = False) -> str:
        """
        Create a Stripe customer or return existing one
        If update_if_exists is True, update the existing customer with new data
        Returns the Stripe customer ID
        """
        if existing_stripe_id:
            try:
                # Verify customer exists
                existing_customer = stripe.Customer.retrieve(existing_stripe_id)
                
                # Update customer if requested
                if update_if_exists:
                    update_params = {
                        "name": client_data.get("name"),
                        "email": client_data.get("email"),
                        "phone": client_data.get("phone"),
                        "metadata": {
                            "client_id": client_data.get("id"),
                            "company": client_data.get("company", ""),
                        }
                    }
                    
                    # Add address if available
                    address = StripeService.format_address_for_stripe(client_data)
                    if address:
                        update_params["address"] = address
                    
                    # Remove None values
                    update_params = {k: v for k, v in update_params.items() if v is not None}
                    
                    # Update the customer
                    stripe.Customer.modify(existing_stripe_id, **update_params)
                
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
        
        # Add address if available
        address = StripeService.format_address_for_stripe(client_data)
        if address:
            customer_params["address"] = address
        
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
        
        # Create the invoice as draft first (before adding items)
        invoice = stripe.Invoice.create(
            customer=customer_id,
            auto_advance=False,  # Don't auto-advance, we'll finalize manually
            collection_method="send_invoice",  # Send invoice to customer
            days_until_due=30,  # Payment due in 30 days
            description=f"Invoice for Quote {quote_number}",
            metadata={
                "quote_id": quote_data.get("id"),
                "quote_number": quote_number,
            }
        )
        
        # Create invoice items for each line item and attach to invoice
        invoice_items = []
        for item in line_items:
            quantity = float(item.get("quantity", 1) or 1)
            unit_price = float(item.get("unit_price", 0) or 0)
            discount_percent = float(item.get("discount_percent", 0) or 0)
            description = item.get("description", "Line item") or "Line item"
            
            # Calculate line item total
            subtotal = quantity * unit_price
            discount_amount = subtotal * (discount_percent / 100)
            line_total = subtotal - discount_amount
            
            # Skip if amount is zero or negative
            if line_total <= 0:
                continue
            
            # Create invoice item and attach directly to the invoice
            invoice_item_params = {
                "customer": customer_id,
                "invoice": invoice.id,  # Explicitly attach to this invoice
                "currency": quote_data.get("currency", "usd").lower(),
                "description": description,
                "metadata": {
                    "quote_id": quote_data.get("id"),
                    "line_item_id": str(item.get("id", "")),
                }
            }
            
            # If there's a discount, use the discounted amount
            # Otherwise use quantity and unit_price for better display
            if discount_percent > 0:
                # Apply discount by using the discounted total as the amount
                invoice_item_params["amount"] = int(line_total * 100)
                invoice_item_params["description"] = f"{description} (Qty: {quantity}, Discount: {discount_percent}%)"
            else:
                # Use quantity and unit_price for better Stripe display
                invoice_item_params["quantity"] = int(quantity) if quantity == int(quantity) else quantity
                invoice_item_params["unit_amount"] = int(unit_price * 100)  # Convert to cents
            
            try:
                invoice_item = stripe.InvoiceItem.create(**invoice_item_params)
                invoice_items.append(invoice_item.id)
            except Exception as e:
                # Log error but continue with other items
                import logging
                logging.error(f"Failed to create invoice item: {str(e)}, Item: {description}")
                # Fallback: create with just amount
                try:
                    invoice_item = stripe.InvoiceItem.create(
                        customer=customer_id,
                        invoice=invoice.id,
                        amount=int(line_total * 100),
                        currency=quote_data.get("currency", "usd").lower(),
                        description=description,
                        metadata={
                            "quote_id": quote_data.get("id"),
                            "line_item_id": str(item.get("id", "")),
                        }
                    )
                    invoice_items.append(invoice_item.id)
                except Exception as e2:
                    logging.error(f"Failed to create invoice item (fallback): {str(e2)}")
                    raise
        
        # Add tax as a separate line item if applicable
        if tax_cents > 0:
            stripe.InvoiceItem.create(
                customer=customer_id,
                invoice=invoice.id,  # Attach to invoice
                amount=tax_cents,
                currency=quote_data.get("currency", "usd").lower(),
                description=f"Tax ({quote_data.get('tax_rate', 0)}%)",
                metadata={
                    "quote_id": quote_data.get("id"),
                    "type": "tax",
                }
            )
        
        # Finalize the invoice (this will include all attached invoice items)
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

