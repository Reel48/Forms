from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

# Client Models
class ClientBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class Client(ClientBase):
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Line Item Models
class LineItemBase(BaseModel):
    description: str
    quantity: Decimal = Decimal("1")
    unit_price: Decimal
    discount_percent: Optional[Decimal] = Decimal("0")
    tax_rate: Optional[Decimal] = Decimal("0")

class LineItemCreate(LineItemBase):
    pass

class LineItem(LineItemBase):
    id: str
    quote_id: str
    line_total: Decimal
    
    class Config:
        from_attributes = True

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
    client: Optional[Client] = None
    
    class Config:
        from_attributes = True

