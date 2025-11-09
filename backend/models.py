from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
import json

# Client Models
class ClientBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None  # Keep for backward compatibility
    notes: Optional[str] = None
    # Structured address fields
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_postal_code: Optional[str] = None
    address_country: Optional[str] = "US"
    
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

# Company Settings Models
class CompanySettingsBase(BaseModel):
    company_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    tax_id: Optional[str] = None
    logo_url: Optional[str] = None
    
    @field_validator('email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        """Convert empty strings to None for email field"""
        if v == "" or v is None:
            return None
        return v

class CompanySettings(CompanySettingsBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if isinstance(v, str):
            try:
                if 'T' in v or ' ' in v:
                    v_iso = v.replace(' ', 'T')
                    if v_iso.endswith('+00') or v_iso.endswith('-00'):
                        v_iso = v_iso.replace('+00', '+00:00').replace('-00', '-00:00')
                    return datetime.fromisoformat(v_iso)
                return datetime.fromisoformat(v)
            except (ValueError, AttributeError):
                try:
                    from dateutil import parser
                    return parser.parse(v)
                except ImportError:
                    raise ValueError(f"Unable to parse datetime: {v}")
        return v
    
    class Config:
        from_attributes = True

class CompanySettingsUpdate(CompanySettingsBase):
    pass

# Form Models
class FormFieldBase(BaseModel):
    field_type: str  # text, email, number, dropdown, multiple_choice, checkbox, etc.
    label: str
    description: Optional[str] = None
    placeholder: Optional[str] = None
    required: bool = False
    validation_rules: Dict[str, Any] = {}
    options: List[Dict[str, Any]] = []  # For dropdown, multiple choice, etc.
    order_index: int = 0
    conditional_logic: Dict[str, Any] = {}

class FormFieldCreate(FormFieldBase):
    pass

class FormField(FormFieldBase):
    id: str
    form_id: str
    created_at: datetime
    
    @field_validator('created_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if isinstance(v, str):
            try:
                if 'T' in v or ' ' in v:
                    v_iso = v.replace(' ', 'T')
                    if v_iso.endswith('+00') or v_iso.endswith('-00'):
                        v_iso = v_iso.replace('+00', '+00:00').replace('-00', '-00:00')
                    return datetime.fromisoformat(v_iso)
                return datetime.fromisoformat(v)
            except (ValueError, AttributeError):
                try:
                    from dateutil import parser
                    return parser.parse(v)
                except ImportError:
                    raise ValueError(f"Unable to parse datetime: {v}")
        return v
    
    class Config:
        from_attributes = True

class FormBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "draft"  # draft, published, archived
    public_url_slug: Optional[str] = None
    theme: Dict[str, Any] = {}
    settings: Dict[str, Any] = {}
    welcome_screen: Dict[str, Any] = {}
    thank_you_screen: Dict[str, Any] = {}

class FormCreate(FormBase):
    fields: List[FormFieldCreate] = []

class FormUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    theme: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None
    welcome_screen: Optional[Dict[str, Any]] = None
    thank_you_screen: Optional[Dict[str, Any]] = None

class Form(FormBase):
    id: str
    created_at: datetime
    updated_at: datetime
    fields: List[FormField] = []
    
    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if isinstance(v, str):
            try:
                if 'T' in v or ' ' in v:
                    v_iso = v.replace(' ', 'T')
                    if v_iso.endswith('+00') or v_iso.endswith('-00'):
                        v_iso = v_iso.replace('+00', '+00:00').replace('-00', '-00:00')
                    return datetime.fromisoformat(v_iso)
                return datetime.fromisoformat(v)
            except (ValueError, AttributeError):
                try:
                    from dateutil import parser
                    return parser.parse(v)
                except ImportError:
                    raise ValueError(f"Unable to parse datetime: {v}")
        return v
    
    class Config:
        from_attributes = True
        populate_by_name = True

# Form Submission Models
class FormSubmissionAnswerBase(BaseModel):
    field_id: str
    answer_text: Optional[str] = None
    answer_value: Dict[str, Any] = {}

class FormSubmissionAnswerCreate(FormSubmissionAnswerBase):
    pass

class FormSubmissionAnswer(FormSubmissionAnswerBase):
    id: str
    submission_id: str
    created_at: datetime
    
    @field_validator('created_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if isinstance(v, str):
            try:
                if 'T' in v or ' ' in v:
                    v_iso = v.replace(' ', 'T')
                    if v_iso.endswith('+00') or v_iso.endswith('-00'):
                        v_iso = v_iso.replace('+00', '+00:00').replace('-00', '-00:00')
                    return datetime.fromisoformat(v_iso)
                return datetime.fromisoformat(v)
            except (ValueError, AttributeError):
                try:
                    from dateutil import parser
                    return parser.parse(v)
                except ImportError:
                    raise ValueError(f"Unable to parse datetime: {v}")
        return v
    
    class Config:
        from_attributes = True

class FormSubmissionBase(BaseModel):
    form_id: str
    submitter_email: Optional[str] = None
    submitter_name: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    started_at: Optional[datetime] = None
    time_spent_seconds: Optional[int] = None
    status: str = "completed"  # completed, abandoned

class FormSubmissionCreate(FormSubmissionBase):
    answers: List[FormSubmissionAnswerCreate] = []

class FormSubmission(FormSubmissionBase):
    id: str
    submitted_at: datetime
    answers: List[FormSubmissionAnswer] = []
    
    @field_validator('submitted_at', 'started_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if isinstance(v, str):
            try:
                if 'T' in v or ' ' in v:
                    v_iso = v.replace(' ', 'T')
                    if v_iso.endswith('+00') or v_iso.endswith('-00'):
                        v_iso = v_iso.replace('+00', '+00:00').replace('-00', '-00:00')
                    return datetime.fromisoformat(v_iso)
                return datetime.fromisoformat(v)
            except (ValueError, AttributeError):
                try:
                    from dateutil import parser
                    return parser.parse(v)
                except ImportError:
                    raise ValueError(f"Unable to parse datetime: {v}")
        return v
    
    class Config:
        from_attributes = True

