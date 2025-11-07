from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
import json

# Client Models
class ClientBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    
    @field_validator('email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        """Convert empty strings to None for email field"""
        if v == "" or v is None:
            return None
        return v

class ClientCreate(ClientBase):
    pass

class Client(ClientBase):
    id: str
    created_at: datetime
    stripe_customer_id: Optional[str] = None
    
    @field_validator('created_at', mode='before')
    @classmethod
    def parse_created_at(cls, v):
        """Parse created_at from string or datetime"""
        if isinstance(v, str):
            # Handle ISO format strings from Supabase
            # Supabase returns timestamps like "2025-11-07 16:10:22.788214+00"
            try:
                # Try standard fromisoformat first
                if 'T' in v or ' ' in v:
                    # Replace space with T for ISO format, handle timezone
                    v_iso = v.replace(' ', 'T')
                    if v_iso.endswith('+00') or v_iso.endswith('-00'):
                        v_iso = v_iso.replace('+00', '+00:00').replace('-00', '-00:00')
                    return datetime.fromisoformat(v_iso)
                return datetime.fromisoformat(v)
            except (ValueError, AttributeError):
                # Fallback: try dateutil if available
                try:
                    from dateutil import parser
                    return parser.parse(v)
                except ImportError:
                    # Last resort: basic parsing
                    raise ValueError(f"Unable to parse datetime: {v}")
        return v
    
    class Config:
        from_attributes = True

# Line Item Models
class LineItemBase(BaseModel):
    description: str
    quantity: Decimal = Decimal("1")
    unit_price: Decimal
    discount_percent: Optional[Decimal] = Decimal("0")
    tax_rate: Optional[Decimal] = Decimal("0")
    
    class Config:
        json_encoders = {
            Decimal: lambda v: str(v)
        }

class LineItemCreate(LineItemBase):
    pass

class LineItem(LineItemBase):
    id: str
    quote_id: str
    line_total: Decimal
    
    class Config:
        from_attributes = True
        json_encoders = {
            Decimal: lambda v: str(v)
        }

# Quote Models
class QuoteBase(BaseModel):
    title: str
    client_id: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    expiration_date: Optional[datetime] = None
    tax_rate: Decimal = Decimal("0")
    currency: str = "USD"
    status: str = "draft"  # draft, sent, viewed, accepted, declined
    
    class Config:
        json_encoders = {
            Decimal: lambda v: str(v)
        }

class QuoteCreate(QuoteBase):
    line_items: List[LineItemCreate] = []

class QuoteUpdate(BaseModel):
    title: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    expiration_date: Optional[datetime] = None
    tax_rate: Optional[Decimal] = None
    currency: Optional[str] = None
    status: Optional[str] = None

class Quote(QuoteBase):
    id: str
    quote_number: str
    subtotal: Decimal
    tax_amount: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    line_items: List[LineItem] = []
    clients: Optional[Client] = None  # Supabase returns 'clients' (table name) - matches frontend expectation
    stripe_invoice_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    payment_status: Optional[str] = "unpaid"
    
    class Config:
        from_attributes = True
        populate_by_name = True  # Allow both field name and alias
        json_encoders = {
            Decimal: lambda v: str(v)
        }

