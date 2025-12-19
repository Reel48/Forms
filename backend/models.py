from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
import json

# Chat Models
class ChatMessageBase(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Message content (1-5000 characters)")
    message_type: str = "text"  # text, file, image
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    
    @field_validator('message')
    @classmethod
    def validate_message(cls, v):
        """Validate message is not empty after trimming"""
        if not v or not v.strip():
            raise ValueError("Message cannot be empty")
        return v.strip()

class ChatMessageCreate(ChatMessageBase):
    conversation_id: Optional[str] = None  # Will be created if not provided

class ChatMessage(ChatMessageBase):
    id: str
    conversation_id: str
    sender_id: str
    read_at: Optional[datetime] = None
    created_at: datetime

class ChatConversationBase(BaseModel):
    status: str = "active"  # active, resolved, archived

class ChatConversation(ChatConversationBase):
    id: str
    customer_id: str
    last_message_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    unread_count: Optional[int] = 0  # For admin view
    last_message: Optional[ChatMessage] = None  # For admin view
    customer_email: Optional[str] = None  # For admin view
    customer_name: Optional[str] = None  # For admin view

class ChatConversationList(BaseModel):
    conversations: List[ChatConversation]
    total: int

class CheckSessionRequest(BaseModel):
    conversation_id: Optional[str] = None

# Client Models
class ClientBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None  # Keep for backward compatibility
    notes: Optional[str] = None
    profile_picture_url: Optional[str] = None
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

# Profile Completion Models
class ProfileCompletionStatus(BaseModel):
    is_complete: bool
    missing_fields: List[str] = []
    profile_completed_at: Optional[datetime] = None

class Client(ClientBase):
    id: str
    created_at: datetime
    stripe_customer_id: Optional[str] = None
    user_id: Optional[str] = None  # Link to auth.users
    registration_source: Optional[str] = "admin_created"  # admin_created or self_registered

    # Notification preferences (added via migration)
    phone_e164: Optional[str] = None
    preferred_notification_channel: Optional[str] = "email"  # email only (SMS no longer supported)
    sms_opt_in: Optional[bool] = False  # Deprecated: SMS no longer supported
    sms_opt_in_at: Optional[datetime] = None  # Deprecated: SMS no longer supported
    sms_opt_out_at: Optional[datetime] = None  # Deprecated: SMS no longer supported
    sms_verified: Optional[bool] = False  # Deprecated: SMS no longer supported
    sms_verified_at: Optional[datetime] = None  # Deprecated: SMS no longer supported
    profile_completed_at: Optional[datetime] = None  # Timestamp when profile onboarding was completed
    
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
    priority: Optional[str] = "normal"  # normal, high
    
    class Config:
        json_encoders = {
            Decimal: lambda v: str(v)
        }

class QuoteCreate(QuoteBase):
    line_items: List[LineItemCreate] = []
    create_folder: Optional[bool] = False  # Option to create folder with quote
    assign_folder_to_user_id: Optional[str] = None  # User to assign folder to

class QuoteUpdate(BaseModel):
    title: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    create_folder: Optional[bool] = None  # Option to create folder if quote doesn't have one
    expiration_date: Optional[datetime] = None
    tax_rate: Optional[Decimal] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None

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
    folder_id: Optional[str] = None  # Folder associated with this quote
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
    label: str = ""  # Allow empty labels for draft fields
    description: Optional[str] = None
    placeholder: Optional[str] = None
    required: bool = False
    validation_rules: Dict[str, Any] = {}
    options: List[Dict[str, Any]] = []  # For dropdown, multiple choice, etc.
    order_index: int = 0
    conditional_logic: Dict[str, Any] = {}

class FormFieldCreate(FormFieldBase):
    pass

class FormFieldUpdate(BaseModel):
    """Update model for form fields - all fields optional"""
    field_type: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    placeholder: Optional[str] = None
    required: Optional[bool] = None
    validation_rules: Optional[Dict[str, Any]] = None
    options: Optional[List[Dict[str, Any]]] = None
    order_index: Optional[int] = None
    conditional_logic: Optional[Dict[str, Any]] = None

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
    priority: Optional[str] = "normal"  # normal, high
    is_template: bool = True  # True for reusable templates, False for project-specific instances
    delivery_timing: Optional[str] = "before_delivery"  # before_delivery, after_delivery
    public_url_slug: Optional[str] = None
    theme: Dict[str, Any] = {}
    settings: Dict[str, Any] = {}
    welcome_screen: Dict[str, Any] = {}
    thank_you_screen: Dict[str, Any] = {}
    # Typeform integration fields
    typeform_form_id: Optional[str] = None
    typeform_form_url: Optional[str] = None
    typeform_workspace_id: Optional[str] = None
    is_typeform_form: bool = False
    typeform_settings: Dict[str, Any] = {}

class FormCreate(FormBase):
    fields: List[FormFieldCreate] = []

class FormUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    delivery_timing: Optional[str] = None
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
    # Optional folder scoping: used to mark completion per order/folder (repeat orders supported)
    folder_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    started_at: Optional[datetime] = None
    time_spent_seconds: Optional[int] = None
    status: str = "completed"  # completed, abandoned

class FormSubmissionCreate(FormSubmissionBase):
    answers: List[FormSubmissionAnswerCreate] = []
    captcha_token: Optional[str] = None  # For CAPTCHA verification

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

# File Models
class FileBase(BaseModel):
    name: str
    original_filename: str
    file_type: str  # MIME type
    file_size: int  # Size in bytes
    storage_path: str
    storage_url: Optional[str] = None
    folder_id: Optional[str] = None
    quote_id: Optional[str] = None
    form_id: Optional[str] = None
    esignature_document_id: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []
    is_reusable: bool = False

class FileCreate(FileBase):
    uploaded_by: Optional[str] = None

class FileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    is_reusable: Optional[bool] = None
    folder_id: Optional[str] = None
    quote_id: Optional[str] = None
    form_id: Optional[str] = None

class File(FileBase):
    id: str
    uploaded_by: Optional[str] = None
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

# File Folder Assignment Models
class FileFolderAssignmentBase(BaseModel):
    file_id: str
    folder_id: str

class FileFolderAssignmentCreate(FileFolderAssignmentBase):
    assigned_by: Optional[str] = None

class FileFolderAssignment(FileFolderAssignmentBase):
    id: str
    assigned_at: datetime
    assigned_by: Optional[str] = None
    
    @field_validator('assigned_at', mode='before')
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

# E-Signature Models
class ESignatureDocumentBase(BaseModel):
    name: str
    description: Optional[str] = None
    file_id: str
    document_type: str = "terms_of_service"  # terms_of_service, contract, agreement, custom
    signature_mode: str = "simple"  # simple, advanced
    require_signature: bool = True
    signature_fields: Optional[Dict[str, Any]] = None  # JSONB for advanced mode
    is_template: bool = True  # True for reusable templates, False for project-specific instances
    folder_id: Optional[str] = None
    quote_id: Optional[str] = None
    expires_at: Optional[datetime] = None

class ESignatureDocumentCreate(ESignatureDocumentBase):
    created_by: Optional[str] = None

class ESignatureDocumentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    document_type: Optional[str] = None
    signature_mode: Optional[str] = None
    require_signature: Optional[bool] = None
    signature_fields: Optional[Dict[str, Any]] = None
    folder_id: Optional[str] = None
    quote_id: Optional[str] = None
    status: Optional[str] = None
    expires_at: Optional[datetime] = None

class ESignatureDocument(ESignatureDocumentBase):
    id: str
    status: str  # pending, signed, declined, expired
    signed_by: Optional[str] = None
    signed_at: Optional[datetime] = None
    signed_ip_address: Optional[str] = None
    signature_method: Optional[str] = None  # draw, type, upload
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    @field_validator('signature_fields', mode='before')
    @classmethod
    def validate_signature_fields(cls, v):
        """Convert empty arrays to None, and ensure dict format"""
        if v is None:
            return None
        if isinstance(v, list):
            # Convert empty array to None, or convert array to dict if needed
            if len(v) == 0:
                return None
            # If it's a non-empty array, we might need to handle it differently
            # For now, return None to avoid validation errors
            return None
        if isinstance(v, dict):
            return v
        # Try to parse as JSON string
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list) and len(parsed) == 0:
                    return None
                if isinstance(parsed, dict):
                    return parsed
                return None
            except:
                return None
        return None
    
    @field_validator('created_at', 'updated_at', 'signed_at', 'expires_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if v is None:
            return None
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

class ESignatureSignatureBase(BaseModel):
    document_id: str
    folder_id: Optional[str] = None
    signature_data: str  # Base64 encoded signature image or text
    signature_type: str  # draw, type, upload
    signature_position: Optional[Dict[str, Any]] = None  # Position on document (x, y, page)
    field_id: Optional[str] = None  # For advanced mode
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

class ESignatureSignatureCreate(ESignatureSignatureBase):
    user_id: Optional[str] = None

class ESignatureSignature(ESignatureSignatureBase):
    id: str
    user_id: str
    signed_at: datetime
    signed_file_id: Optional[str] = None
    signed_file_url: Optional[str] = None
    
    @field_validator('signed_at', mode='before')
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

class ESignatureDocumentFolderAssignmentBase(BaseModel):
    document_id: str
    folder_id: str

class ESignatureDocumentFolderAssignmentCreate(ESignatureDocumentFolderAssignmentBase):
    assigned_by: Optional[str] = None

class ESignatureDocumentFolderAssignment(ESignatureDocumentFolderAssignmentBase):
    id: str
    assigned_at: datetime
    assigned_by: Optional[str] = None
    status: str  # pending, signed, declined
    signed_at: Optional[datetime] = None
    
    @field_validator('assigned_at', 'signed_at', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if v is None:
            return None
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

# Folder Models
class FolderBase(BaseModel):
    name: str
    description: Optional[str] = None
    quote_id: Optional[str] = None
    client_id: Optional[str] = None
    status: str = "active"  # active, completed, archived, cancelled

class FolderCreate(FolderBase):
    created_by: Optional[str] = None
    assign_to_user_id: Optional[str] = None  # User to assign folder to

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    quote_id: Optional[str] = None
    client_id: Optional[str] = None
    status: Optional[str] = None

class Folder(FolderBase):
    id: str
    created_by: Optional[str] = None
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

class FolderAssignmentBase(BaseModel):
    folder_id: str
    user_id: str
    role: str = "viewer"  # viewer, editor

class FolderAssignmentCreate(FolderAssignmentBase):
    assigned_by: Optional[str] = None

class FolderAssignment(FolderAssignmentBase):
    id: str
    assigned_at: datetime
    assigned_by: Optional[str] = None
    
    @field_validator('assigned_at', mode='before')
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

class FormFolderAssignmentBase(BaseModel):
    form_id: str
    folder_id: str

class FormFolderAssignmentCreate(FormFolderAssignmentBase):
    assigned_by: Optional[str] = None

class FormFolderAssignment(FormFolderAssignmentBase):
    id: str
    assigned_at: datetime
    assigned_by: Optional[str] = None
    
    @field_validator('assigned_at', mode='before')
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

class ShipmentBase(BaseModel):
    folder_id: str
    tracking_number: str
    carrier: str
    carrier_name: Optional[str] = None

class ShipmentCreate(ShipmentBase):
    pass

class ShipmentUpdate(BaseModel):
    status: Optional[str] = None
    status_details: Optional[str] = None
    estimated_delivery_date: Optional[datetime] = None
    actual_delivery_date: Optional[datetime] = None

class Shipment(ShipmentBase):
    id: str
    shippo_tracking_id: Optional[str] = None
    status: str = "pending"
    status_details: Optional[str] = None
    estimated_delivery_date: Optional[datetime] = None
    actual_delivery_date: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    @field_validator('created_at', 'updated_at', 'estimated_delivery_date', 'actual_delivery_date', mode='before')
    @classmethod
    def parse_datetime(cls, v):
        """Parse datetime from string or datetime"""
        if v is None:
            return None
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

class TrackingEvent(BaseModel):
    id: str
    shipment_id: str
    status: str
    location: Optional[str] = None
    description: Optional[str] = None
    timestamp: datetime
    created_at: datetime
    
    @field_validator('timestamp', 'created_at', mode='before')
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

