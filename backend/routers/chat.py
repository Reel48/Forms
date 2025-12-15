from fastapi import APIRouter, HTTPException, Depends, UploadFile, File as FastAPIFile, Query, BackgroundTasks
from typing import List, Optional, Dict, Any
from decimal import Decimal

import sys
import os
import uuid
from datetime import datetime
import re
import requests
import logging
import asyncio
from zoneinfo import ZoneInfo

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import ChatMessage, ChatMessageCreate, ChatConversation
from database import supabase_storage, supabase_service_role_key, supabase_url
from auth import get_current_user, get_current_admin
from ai_service import get_ai_service
from rag_service import get_rag_service
from ai_action_executor import AIActionExecutor
from chat_cleanup import cleanup_old_chat_history
from attachment_service import download_attachment, extract_text_from_attachment_bytes
from calcom_service import CalComService

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Configure logging
logger = logging.getLogger(__name__)

def _detect_order_type(line_items: list) -> Optional[str]:
    """
    Detect if an order is for hats or coozies based on line items descriptions.
    Returns 'hat', 'coozie', or None if unclear.
    """
    if not line_items or not isinstance(line_items, list):
        return None
    
    # Check all line items for keywords
    has_hat = False
    has_coozie = False
    
    for item in line_items:
        if not isinstance(item, dict):
            continue
        
        description = str(item.get("description", "")).lower()
        
        # Check for hat keywords
        if any(keyword in description for keyword in ["hat", "cap", "headwear"]):
            has_hat = True
        
        # Check for coozie keywords (including variations)
        if any(keyword in description for keyword in ["coozie", "coozy", "koozie", "koozy", "can cooler", "beverage holder"]):
            has_coozie = True
    
    # If both are found, prioritize based on what's more common
    # If only one is found, return that
    if has_coozie and not has_hat:
        return "coozie"
    elif has_hat and not has_coozie:
        return "hat"
    elif has_hat and has_coozie:
        # If both, check which appears more frequently
        hat_count = sum(1 for item in line_items if isinstance(item, dict) and any(kw in str(item.get("description", "")).lower() for kw in ["hat", "cap", "headwear"]))
        coozie_count = sum(1 for item in line_items if isinstance(item, dict) and any(kw in str(item.get("description", "")).lower() for kw in ["coozie", "coozy", "koozie", "koozy", "can cooler", "beverage holder"]))
        return "coozie" if coozie_count >= hat_count else "hat"
    
    return None

def _convert_proto_to_dict(obj):
    """Convert proto objects (like MapComposite, RepeatedComposite) to regular Python dicts/lists"""
    if obj is None:
        return None
    
    # If it's already a dict, recursively process values
    if isinstance(obj, dict):
        return {k: _convert_proto_to_dict(v) for k, v in obj.items()}
    
    # If it's a list, recursively process items
    if isinstance(obj, list):
        return [_convert_proto_to_dict(item) for item in obj]
    
    # Check if it's a proto object
    if hasattr(obj, '__class__'):
        obj_type_str = str(type(obj)).lower()
        obj_type_name = type(obj).__name__
        
        # Handle RepeatedComposite (list-like proto objects)
        if 'repeatedcomposite' in obj_type_str or obj_type_name == 'RepeatedComposite':
            try:
                # Convert to list by iterating
                return [_convert_proto_to_dict(item) for item in obj]
            except (TypeError, ValueError, AttributeError) as e:
                logger.warning(f"Could not convert RepeatedComposite to list: {e}, type: {type(obj)}")
                return []
        
        # Handle MapComposite (dict-like proto objects)
        if 'mapcomposite' in obj_type_str or obj_type_name == 'MapComposite':
            try:
                # Try to convert to dict using keys() and values()
                if hasattr(obj, 'keys') and hasattr(obj, 'values'):
                    return {k: _convert_proto_to_dict(v) for k, v in zip(obj.keys(), obj.values())}
                # Try dict() constructor
                if hasattr(obj, '__iter__') and not isinstance(obj, (str, bytes)):
                    # Check if it's iterable as key-value pairs
                    try:
                        # Try to see if it can be unpacked as key-value pairs
                        first_item = next(iter(obj))
                        if isinstance(first_item, (list, tuple)) and len(first_item) == 2:
                            return {k: _convert_proto_to_dict(v) for k, v in obj}
                    except (StopIteration, TypeError, ValueError):
                        pass
                    # If not key-value pairs, try dict() constructor
                    return dict(obj)
            except (TypeError, ValueError, AttributeError) as e:
                logger.warning(f"Could not convert MapComposite to dict: {e}, type: {type(obj)}")
                # If conversion fails, try to get string representation
                return str(obj)
        
        # Handle other proto objects
        if 'proto' in obj_type_str:
            try:
                # Try to convert to dict using keys() and values()
                if hasattr(obj, 'keys') and hasattr(obj, 'values'):
                    return {k: _convert_proto_to_dict(v) for k, v in zip(obj.keys(), obj.values())}
                # Try dict() constructor
                return dict(obj)
            except (TypeError, ValueError, AttributeError) as e:
                logger.warning(f"Could not convert proto object to dict: {e}, type: {type(obj)}")
                # If conversion fails, try to get string representation
                return str(obj)
    
    # For other types, try to convert to dict if possible
    if hasattr(obj, '__dict__'):
        return _convert_proto_to_dict(obj.__dict__)
    
    # Return as-is for primitives (str, int, float, bool, etc.)
    return obj

# Get Ocho (AI assistant) user ID from environment or use fallback
# Ocho is a special user account for AI messages
OCHO_USER_ID = os.getenv("OCHO_USER_ID")
if not OCHO_USER_ID:
    # Fallback: Try to find Ocho user by email
    try:
        ocho_client = supabase_storage.table("clients").select("user_id").eq("email", "ocho@reel48.ai").single().execute()
        if ocho_client.data and ocho_client.data.get("user_id"):
            OCHO_USER_ID = ocho_client.data["user_id"]
            logger.info(f"Found Ocho user ID from database: {OCHO_USER_ID}")
    except Exception as e:
        logger.warning(f"Could not find Ocho user ID: {str(e)}")
        # Use fallback UUID if not found
        OCHO_USER_ID = "00000000-0000-0000-0000-000000000000"
        logger.warning(f"Using fallback UUID for AI messages. Please set OCHO_USER_ID environment variable.")

if OCHO_USER_ID and OCHO_USER_ID != "00000000-0000-0000-0000-000000000000":
    logger.info(f"Using Ocho user ID for AI messages: {OCHO_USER_ID}")

@router.get("/ocho-user-id")
async def get_ocho_user_id():
    """Get Ocho (AI assistant) user ID for frontend"""
    return {"ocho_user_id": OCHO_USER_ID}

# --- Scheduling helpers (used for follow-up availability messages) ---
SCHEDULING_TZ_FALLBACK = os.getenv("CHAT_SCHEDULING_DEFAULT_TZ", "America/Chicago")


def _infer_timezone_from_text(text: str) -> str:
    if not text:
        return SCHEDULING_TZ_FALLBACK
    t = text.strip()
    m = re.search(r"\b([A-Za-z]+/[A-Za-z_]+)\b", t)
    if m:
        return m.group(1)
    abbr_map = {
        "pst": "America/Los_Angeles",
        "pdt": "America/Los_Angeles",
        "mst": "America/Denver",
        "mdt": "America/Denver",
        "cst": "America/Chicago",
        "cdt": "America/Chicago",
        "est": "America/New_York",
        "edt": "America/New_York",
    }
    m2 = re.search(r"\b(pst|pdt|mst|mdt|cst|cdt|est|edt)\b", t.lower())
    if m2:
        return abbr_map.get(m2.group(1)) or SCHEDULING_TZ_FALLBACK
    return SCHEDULING_TZ_FALLBACK


def _format_slot_local(start_iso: str, tz: str) -> str:
    try:
        utc = ZoneInfo("UTC")
        local = ZoneInfo(tz)
        start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        if not start_dt.tzinfo:
            start_dt = start_dt.replace(tzinfo=utc)
        local_dt = start_dt.astimezone(local)
        try:
            return local_dt.strftime("%a %b %d, %-I:%M %p")
        except Exception:
            return local_dt.strftime("%a %b %d, %I:%M %p").lstrip("0")
    except Exception:
        return start_iso


def _get_pending_action(conversation_id: str) -> Optional[Dict[str, Any]]:
    try:
        resp = supabase_storage.table("chat_conversations").select("pending_action").eq("id", conversation_id).single().execute()
        pa = (resp.data or {}).get("pending_action")
        return pa if isinstance(pa, dict) else None
    except Exception:
        return None


def _set_pending_action(conversation_id: str, pending_action: Optional[Dict[str, Any]]) -> None:
    try:
        supabase_storage.table("chat_conversations").update({
            "pending_action": pending_action,
            "pending_action_updated_at": datetime.now().isoformat(),
        }).eq("id", conversation_id).execute()
    except Exception:
        pass


def _insert_ai_message(conversation_id: str, message: str) -> None:
    try:
        supabase_storage.table("chat_messages").insert({
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "sender_id": OCHO_USER_ID,
            "message": message,
            "message_type": "text",
            "created_at": datetime.now().isoformat(),
        }).execute()
    except Exception:
        pass


def _event_duration_minutes(event_type_id: Optional[int]) -> int:
    if not event_type_id:
        return 30
    try:
        calcom = CalComService()
        for et in (calcom.get_event_types() or []):
            if str(et.get("id")) == str(event_type_id):
                return int(et.get("length") or 30)
    except Exception:
        return 30
    return 30


def _extract_slots_from_availability(raw_availability: Dict[str, Any], duration_minutes: int) -> List[Dict[str, str]]:
    """
    Normalize Cal.com availability payloads into a simple list:
      [{"start_time": "<iso>Z"}, ...]

    Cal.com can return different shapes depending on endpoint/version.
    We support:
    - dateRanges: [{start,end}, ...]
    - slots: {"YYYY-MM-DD": ["2025-...Z", ...], ...} or list of ISO strings
    """
    utc = ZoneInfo("UTC")
    slots: List[Dict[str, str]] = []

    # 1) slots mapping or list (preferred when present)
    raw_slots = raw_availability.get("slots")
    if isinstance(raw_slots, dict):
        for _day, times in raw_slots.items():
            if isinstance(times, list):
                for t in times:
                    if isinstance(t, str) and t:
                        slots.append({"start_time": t})
    elif isinstance(raw_slots, list):
        for t in raw_slots:
            if isinstance(t, str) and t:
                slots.append({"start_time": t})
    if slots:
        return sorted(slots, key=lambda s: s.get("start_time", ""))

    # 2) dateRanges windows (build discrete slot instants)
    date_ranges = raw_availability.get("dateRanges") or []
    if not isinstance(date_ranges, list):
        date_ranges = []
    from datetime import timedelta
    dur = timedelta(minutes=duration_minutes)
    for dr in date_ranges:
        start_str = (dr or {}).get("start")
        end_str = (dr or {}).get("end")
        if not start_str or not end_str:
            continue
        try:
            start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
            if not start_dt.tzinfo:
                start_dt = start_dt.replace(tzinfo=utc)
            if not end_dt.tzinfo:
                end_dt = end_dt.replace(tzinfo=utc)
            start_dt = start_dt.astimezone(utc)
            end_dt = end_dt.astimezone(utc)
            cur = start_dt
            while cur + dur <= end_dt:
                slots.append({"start_time": cur.isoformat().replace("+00:00", "Z")})
                cur += dur
        except Exception:
            continue
    return sorted(slots, key=lambda s: s.get("start_time", ""))


def _infer_date_range_from_text(text: str) -> Optional[Dict[str, str]]:
    """
    Best-effort, lightweight date constraint routing for scheduling queries like:
    - today
    - tomorrow
    """
    if not text:
        return None
    t = text.lower()
    today = datetime.now(ZoneInfo("UTC")).date()
    if "today" in t:
        d = today.isoformat()
        return {"date_from": d, "date_to": d}
    if "tomorrow" in t:
        from datetime import timedelta
        d = (today + timedelta(days=1)).isoformat()
        return {"date_from": d, "date_to": d}
    return None


def _render_availability_message(slots: List[Dict[str, str]], tz: str, limit: int = 10) -> str:
    if not slots:
        return "I’m not seeing any open times right now. Tell me a couple days/times that work for you and I’ll try again."
    lines = [f"Here are some available times ({tz}). Reply with the number you want:"]
    for i, s in enumerate(slots[:limit], start=1):
        lines.append(f"{i}) {_format_slot_local(s.get('start_time',''), tz)}")
    return "\n".join(lines)

# File upload constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_FILE_TYPES = {
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.csv', '.xls', '.xlsx'}

@router.get("/conversations", response_model=List[ChatConversation])
async def get_conversations(user = Depends(get_current_user)):
    """Get conversations. Admins see all, customers see their own."""
    try:
        # Check if user is admin
        is_admin = user.get("role") == "admin"
        
        if is_admin:
            # Admin: Get all conversations with customer info and unread counts
            logger.info(f"Admin {user['id']} ({user.get('email')}) fetching all conversations")
            
            # Fetch all conversations (Supabase client may not support nulls_last, so we'll sort in Python)
            conversations_response = supabase_storage.table("chat_conversations").select("*").execute()
            conversations = conversations_response.data if conversations_response.data else []
            
            # Sort conversations: those with last_message_at first (descending), then by created_at (descending)
            # This ensures conversations with messages appear first, but all conversations are included
            def sort_key(conv):
                last_msg_at = conv.get("last_message_at")
                created_at = conv.get("created_at", "")
                
                # Return tuple for sorting:
                # First element: False if has last_message_at (sorts first), True if not (sorts last)
                # Second element: last_message_at or created_at (for sorting by date descending)
                # When reverse=True, False comes before True, and dates are sorted descending
                has_last_msg = last_msg_at is not None
                sort_date = last_msg_at if last_msg_at else created_at
                return (has_last_msg, sort_date or "")
            
            # Sort with reverse=True: False (has messages) comes before True (no messages)
            # and dates are sorted descending
            conversations.sort(key=sort_key, reverse=True)
            
            logger.info(f"Fetched {len(conversations)} conversations for admin")
            
            # Enrich with customer info and unread counts
            # Use Supabase Admin REST API to get user emails
            headers = {
                "apikey": supabase_service_role_key,
                "Authorization": f"Bearer {supabase_service_role_key}",
                "Content-Type": "application/json"
            }
            
            # Get all conversation IDs for batch operations
            conversation_ids = [conv["id"] for conv in conversations]
            
            # Batch fetch unread counts for all conversations in a single query
            unread_counts = {}
            if conversation_ids:
                try:
                    # Get all unread messages for all conversations at once
                    # Note: Supabase doesn't support GROUP BY directly, so we'll fetch all unread messages
                    # and count them in Python (still more efficient than N queries)
                    unread_messages_response = (
                        supabase_storage
                        .table("chat_messages")
                        .select("conversation_id")
                        .in_("conversation_id", conversation_ids)
                        .is_("read_at", "null")
                        .neq("sender_id", user["id"])
                        .neq("message_type", "system")
                        .execute()
                    )
                    unread_messages = unread_messages_response.data if unread_messages_response.data else []
                    
                    # Count unread messages per conversation
                    for msg in unread_messages:
                        conv_id = msg.get("conversation_id")
                        if conv_id:
                            unread_counts[conv_id] = unread_counts.get(conv_id, 0) + 1
                except Exception as e:
                    logger.warning(f"Error batch fetching unread counts: {str(e)}")
            
            # Batch fetch last messages for all conversations
            last_messages = {}
            if conversation_ids:
                try:
                    # Get last message for each conversation
                    # We'll need to do this per conversation since Supabase doesn't support window functions easily
                    # But we can optimize by doing it in parallel or using a more efficient approach
                    for conv_id in conversation_ids:
                        try:
                            # Skip placeholder/system messages (e.g., AI "thinking" indicator)
                            last_message_response = (
                                supabase_storage
                                .table("chat_messages")
                                .select("*")
                                .eq("conversation_id", conv_id)
                                .neq("message_type", "system")
                                .order("created_at", desc=True)
                                .limit(1)
                                .single()
                                .execute()
                            )
                            if last_message_response.data:
                                last_messages[conv_id] = last_message_response.data
                        except Exception as e:
                            logger.debug(f"No last message found for conversation {conv_id}: {str(e)}")
                            pass
                except Exception as e:
                    logger.warning(f"Error batch fetching last messages: {str(e)}")
            
            for conv in conversations:
                # Get customer info from clients table (which has user_id)
                try:
                    client_response = supabase_storage.table("clients").select("name, email").eq("user_id", conv["customer_id"]).single().execute()
                    if client_response.data:
                        conv["customer_name"] = client_response.data.get("name")
                        conv["customer_email"] = client_response.data.get("email")
                    else:
                        # Fallback: get email from auth.users via REST API
                        try:
                            user_url = f"{supabase_url}/auth/v1/admin/users/{conv['customer_id']}"
                            user_response = requests.get(user_url, headers=headers, timeout=10)
                            if user_response.status_code == 200:
                                user_data = user_response.json()
                                conv["customer_email"] = user_data.get("email")
                                conv["customer_name"] = user_data.get("user_metadata", {}).get("name")
                            else:
                                logger.warning(f"Failed to get user info for {conv['customer_id']}: HTTP {user_response.status_code}")
                                conv["customer_email"] = None
                                conv["customer_name"] = None
                        except requests.RequestException as e:
                            logger.warning(f"Error fetching user info from auth API for {conv['customer_id']}: {str(e)}")
                            conv["customer_email"] = None
                            conv["customer_name"] = None
                except Exception as e:
                    # If no client record, try to get from auth REST API
                    logger.warning(f"Error fetching client info for {conv['customer_id']}: {str(e)}")
                    try:
                        user_url = f"{supabase_url}/auth/v1/admin/users/{conv['customer_id']}"
                        user_response = requests.get(user_url, headers=headers, timeout=10)
                        if user_response.status_code == 200:
                            user_data = user_response.json()
                            conv["customer_email"] = user_data.get("email")
                            conv["customer_name"] = user_data.get("user_metadata", {}).get("name")
                        else:
                            logger.warning(f"Failed to get user info for {conv['customer_id']}: HTTP {user_response.status_code}")
                            conv["customer_email"] = None
                            conv["customer_name"] = None
                    except requests.RequestException as e:
                        logger.warning(f"Error fetching user info from auth API for {conv['customer_id']}: {str(e)}")
                        conv["customer_email"] = None
                        conv["customer_name"] = None
                
                # Set unread count from batch fetch
                conv["unread_count"] = unread_counts.get(conv["id"], 0)
                
                # Set last message from batch fetch
                if conv["id"] in last_messages:
                    conv["last_message"] = last_messages[conv["id"]]
            
            return conversations
        else:
            # Customer: Get all their conversations
            try:
                conversation_response = supabase_storage.table("chat_conversations").select("*").eq("customer_id", user["id"]).order("updated_at", desc=True).execute()
                if conversation_response.data:
                    return conversation_response.data
                return []
            except Exception as e:
                logger.warning(f"Error fetching conversations for customer {user['id']}: {str(e)}")
                return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get conversations: {str(e)}")

@router.get("/conversations/{conversation_id}/messages", response_model=List[ChatMessage])
async def get_messages(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=100, description="Number of messages to return"),
    before_id: Optional[str] = Query(None, description="Load messages before this message ID (for pagination)"),
    user = Depends(get_current_user)
):
    """Get messages for a conversation with pagination support."""
    try:
        # Check if user has access to this conversation
        conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", conversation_id).single().execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conv = conv_response.data
        is_admin = user.get("role") == "admin"
        
        # Check access
        if not is_admin and conv["customer_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Build query
        query = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conversation_id)
        
        # If before_id is provided, load messages before that message
        if before_id:
            # Get the created_at of the before_id message
            before_message_response = supabase_storage.table("chat_messages").select("created_at").eq("id", before_id).single().execute()
            if before_message_response.data:
                before_created_at = before_message_response.data["created_at"]
                query = query.lt("created_at", before_created_at)
        
        # Order by created_at descending (newest first) for pagination, then reverse to show oldest first
        messages_response = query.order("created_at", desc=True).limit(limit).execute()
        messages = messages_response.data if messages_response.data else []
        
        # Reverse to show messages in chronological order (oldest first)
        messages.reverse()
        
        return messages
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting messages for conversation {conversation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get messages: {str(e)}")


@router.get("/conversations/{conversation_id}/ai-actions")
async def get_ai_actions(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=200, description="Number of AI action logs to return"),
    user = Depends(get_current_admin)
):
    """Get AI action audit logs for a conversation (Admin only)."""
    try:
        # Verify conversation exists
        conv_response = supabase_storage.table("chat_conversations").select("id").eq("id", conversation_id).single().execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")

        try:
            logs_resp = (
                supabase_storage
                .table("chat_ai_action_logs")
                .select("*")
                .eq("conversation_id", conversation_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return {"logs": logs_resp.data or []}
        except Exception as e:
            # Table may not exist if migration not applied yet
            raise HTTPException(status_code=501, detail="AI action audit logs are not enabled (migration not applied).")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AI actions for conversation {conversation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get AI action logs")

@router.post("/messages", response_model=ChatMessage)
async def send_message(
    message: ChatMessageCreate, 
    background_tasks: BackgroundTasks,
    user = Depends(get_current_user)
):
    """Send a message. Creates conversation if it doesn't exist for customers."""
    try:
        is_admin = user.get("role") == "admin"
        
        # Get or create conversation
        if message.conversation_id:
            # Verify conversation exists and user has access
            conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", message.conversation_id).single().execute()
            if not conv_response.data:
                raise HTTPException(status_code=404, detail="Conversation not found")
            
            conv = conv_response.data
            if not is_admin and conv["customer_id"] != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
            
            conversation_id = message.conversation_id
        else:
            # Customer creating new conversation or getting existing one
            if is_admin:
                raise HTTPException(status_code=400, detail="Admins must specify conversation_id")
            
            # Get existing conversation or create new one
            # Each customer has only one conversation (UNIQUE constraint on customer_id)
            try:
                # Try to get existing conversation (use execute() instead of single() to avoid exception)
                existing_conv_response = supabase_storage.table("chat_conversations").select("*").eq("customer_id", user["id"]).execute()
                
                if existing_conv_response.data and len(existing_conv_response.data) > 0:
                    # Use existing conversation
                    conversation_id = existing_conv_response.data[0]["id"]
                    logger.info(f"Using existing conversation {conversation_id} for customer {user['id']}")
                else:
                    # No conversation exists, create new one
                    new_conv = {
                        "id": str(uuid.uuid4()),
                        "customer_id": user["id"],
                        "status": "active",
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat()
                    }
                    try:
                        create_response = supabase_storage.table("chat_conversations").insert(new_conv).execute()
                        if not create_response.data:
                            raise HTTPException(status_code=500, detail="Failed to create conversation")
                        conversation_id = create_response.data[0]["id"]
                        logger.info(f"Created new conversation {conversation_id} for customer {user['id']}")
                    except Exception as insert_error:
                        # Handle UNIQUE constraint violation (conversation created by another request)
                        error_str = str(insert_error).lower()
                        if "unique" in error_str or "duplicate" in error_str or "violates unique constraint" in error_str:
                            # Conversation was created by another request, fetch it
                            logger.info(f"Conversation already exists (race condition), fetching for customer {user['id']}")
                            existing_conv_response = supabase_storage.table("chat_conversations").select("*").eq("customer_id", user["id"]).execute()
                            if existing_conv_response.data and len(existing_conv_response.data) > 0:
                                conversation_id = existing_conv_response.data[0]["id"]
                                logger.info(f"Fetched existing conversation {conversation_id} for customer {user['id']}")
                            else:
                                logger.error(f"Failed to fetch conversation after UNIQUE constraint violation for customer {user['id']}")
                                raise HTTPException(status_code=500, detail="Failed to get or create conversation")
                        else:
                            logger.error(f"Error creating conversation: {str(insert_error)}")
                            raise HTTPException(status_code=500, detail=f"Failed to create conversation: {str(insert_error)}")
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Unexpected error in conversation creation: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to get or create conversation: {str(e)}")
        
        # Create message
        message_created_at = datetime.now().isoformat()
        message_data = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "sender_id": user["id"],
            "message": message.message,
            "message_type": message.message_type,
            "file_url": message.file_url,
            "file_name": message.file_name,
            "file_size": message.file_size,
            "created_at": message_created_at
        }
        
        message_response = supabase_storage.table("chat_messages").insert(message_data).execute()
        if not message_response.data:
            raise HTTPException(status_code=500, detail="Failed to send message")
        
        # Explicitly update last_message_at and updated_at in conversation
        # (Database trigger also does this, but explicit update ensures consistency)
        try:
            supabase_storage.table("chat_conversations").update({
                "last_message_at": message_created_at,
                "updated_at": message_created_at
            }).eq("id", conversation_id).execute()
        except Exception as e:
            logger.warning(f"Failed to update last_message_at for conversation {conversation_id}: {str(e)}")
            # Don't fail the request if this update fails - trigger should handle it
        
        # Auto-generate AI response for customer messages
        # Only respond if: 1) Customer sent the message, 2) No admin has responded recently
        if not is_admin and message.message and len(message.message.strip()) > 0:
            try:
                # Respect chat_mode: if customer requested human support, do not auto-respond with AI.
                try:
                    mode_resp = (
                        supabase_storage
                        .table("chat_conversations")
                        .select("chat_mode")
                        .eq("id", conversation_id)
                        .single()
                        .execute()
                    )
                    chat_mode = (mode_resp.data or {}).get("chat_mode") or "ai"
                except Exception:
                    chat_mode = "ai"

                if chat_mode == "human":
                    logger.info(f"Chat mode is 'human' for conversation {conversation_id}; skipping AI auto-response")
                else:
                    # Check if admin has responded recently (within last 5 messages)
                    recent_messages_response = (
                        supabase_storage
                        .table("chat_messages")
                        .select("*")
                        .eq("conversation_id", conversation_id)
                        .order("created_at", desc=True)
                        .limit(5)
                        .execute()
                    )
                    recent_messages = recent_messages_response.data if recent_messages_response.data else []

                    # Check if any recent message is from an admin (verify by checking user_roles)
                    admin_responded_recently = False
                    for msg in recent_messages:
                        sender_id = msg.get("sender_id", "")
                        # Skip if sender is the customer or AI
                        if sender_id == user["id"] or sender_id == OCHO_USER_ID:
                            continue

                        # Verify sender is actually an admin by checking user_roles
                        try:
                            role_response = (
                                supabase_storage
                                .table("user_roles")
                                .select("role")
                                .eq("user_id", sender_id)
                                .single()
                                .execute()
                            )
                            if role_response.data and role_response.data.get("role") == "admin":
                                admin_responded_recently = True
                                logger.info(
                                    f"Admin {sender_id} has responded recently, skipping AI auto-response for conversation {conversation_id}"
                                )
                                break
                        except Exception as role_check_error:
                            # If we can't verify, log but don't assume it's an admin
                            logger.debug(f"Could not verify role for sender {sender_id}: {str(role_check_error)}")
                            continue

                    # Backpressure: if an AI placeholder is already the latest message, don't enqueue another AI job.
                    if not admin_responded_recently:
                        try:
                            last_msg_resp = (
                                supabase_storage
                                .table("chat_messages")
                                .select("sender_id,message_type,created_at")
                                .eq("conversation_id", conversation_id)
                                .order("created_at", desc=True)
                                .limit(1)
                                .single()
                                .execute()
                            )
                            last_msg = last_msg_resp.data or {}
                            if last_msg.get("sender_id") == OCHO_USER_ID and last_msg.get("message_type") == "system":
                                logger.info(f"AI job already pending for conversation {conversation_id}; skipping enqueue")
                                admin_responded_recently = True
                        except Exception:
                            pass

                    if not admin_responded_recently:
                        # Insert a lightweight placeholder "thinking" message immediately.
                        # The UI will render this as a typing indicator and it will be deleted/replaced when the final AI response is saved.
                        placeholder_id = str(uuid.uuid4())
                        placeholder_created_at = datetime.now().isoformat()
                        try:
                            placeholder_message = {
                                "id": placeholder_id,
                                "conversation_id": conversation_id,
                                "sender_id": OCHO_USER_ID,
                                "message": "Reel48 AI is thinking…",
                                "message_type": "system",
                                "created_at": placeholder_created_at,
                            }
                            supabase_storage.table("chat_messages").insert(placeholder_message).execute()
                        except Exception as e:
                            # Don't fail message send if placeholder insert fails
                            logger.warning(f"Failed to insert AI placeholder message: {str(e)}")
                            placeholder_id = None

                        # Trigger AI response asynchronously using BackgroundTasks.
                        # This ensures the task completes even after the request returns.
                        logger.info(f"🔵 Triggering AI response for conversation {conversation_id}, customer {user['id']}")
                        try:
                            background_tasks.add_task(
                                _generate_ai_response_async,
                                conversation_id,
                                user["id"],
                                placeholder_id,
                                message_data["id"],
                            )
                            logger.info("✅ AI response task added to background tasks")
                        except Exception as task_error:
                            logger.error(
                                f"❌ Failed to add AI response to background tasks: {str(task_error)}",
                                exc_info=True,
                            )
            except Exception as e:
                logger.error(f"Failed to trigger AI response: {str(e)}", exc_info=True)
                # Don't fail the message send if AI fails
        
        # Ensure conversation_id is in the response
        message_data = message_response.data[0]
        if not message_data.get("conversation_id"):
            message_data["conversation_id"] = conversation_id
            logger.warning(f"conversation_id missing from message response, adding it: {conversation_id}")
        
        logger.info(f"Message sent successfully: {message_data.get('id')} in conversation {conversation_id}")
        return message_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending message: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")

@router.post("/messages/{message_id}/read")
async def mark_message_read(message_id: str, user = Depends(get_current_user)):
    """Mark a message as read."""
    try:
        # Get message
        message_response = supabase_storage.table("chat_messages").select("*, chat_conversations(*)").eq("id", message_id).single().execute()
        if not message_response.data:
            raise HTTPException(status_code=404, detail="Message not found")
        
        message = message_response.data
        conv = message.get("chat_conversations")
        
        if not conv:
            # Get conversation separately
            conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", message["conversation_id"]).single().execute()
            if not conv_response.data:
                raise HTTPException(status_code=404, detail="Conversation not found")
            conv = conv_response.data
        
        is_admin = user.get("role") == "admin"
        
        # Check access
        if not is_admin and conv["customer_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Only mark as read if message is not from current user
        if message["sender_id"] != user["id"]:
            update_response = supabase_storage.table("chat_messages").update({
                "read_at": datetime.now().isoformat()
            }).eq("id", message_id).execute()
        
        return {"message": "Message marked as read"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking message {message_id} as read: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to mark message as read: {str(e)}")

@router.post("/conversations/{conversation_id}/read-all")
async def mark_all_messages_read(conversation_id: str, user = Depends(get_current_user)):
    """Mark all messages in a conversation as read."""
    try:
        # Verify conversation exists and user has access
        conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", conversation_id).single().execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conv = conv_response.data
        is_admin = user.get("role") == "admin"
        
        # Check access
        if not is_admin and conv["customer_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Mark all unread messages as read (excluding messages sent by current user)
        update_response = supabase_storage.table("chat_messages").update({
            "read_at": datetime.now().isoformat()
        }).eq("conversation_id", conversation_id).is_("read_at", "null").neq("sender_id", user["id"]).execute()
        
        return {"message": "All messages marked as read"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking all messages as read for conversation {conversation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to mark all messages as read: {str(e)}")

@router.post("/messages/upload-file")
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    user = Depends(get_current_user)
):
    """Upload a file attachment for a chat message."""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="File must have a filename")
        
        # Check file extension
        file_extension = os.path.splitext(file.filename)[1].lower()
        if file_extension and file_extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Validate file size
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024 * 1024):.1f}MB"
            )
        
        # Validate content type (if provided)
        if file.content_type and file.content_type not in ALLOWED_FILE_TYPES:
            logger.warning(f"File content type {file.content_type} not in allowed list, but extension is valid")
            # Don't fail if extension is valid but content type is not recognized
        
        # Generate unique filename
        file_id = str(uuid.uuid4())
        unique_filename = f"chat/{file_id}/{uuid.uuid4().hex[:8]}{file_extension}" if file_extension else f"chat/{file_id}/{uuid.uuid4().hex[:8]}"
        
        # Upload to Supabase Storage
        try:
            supabase_storage.storage.from_("project-files").upload(
                unique_filename,
                file_content,
                file_options={
                    "content-type": file.content_type or "application/octet-stream",
                    "upsert": "false"
                }
            )
        except Exception as storage_error:
            raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(storage_error)}")
        
        # Get signed URL
        try:
            signed_url_response = supabase_storage.storage.from_("project-files").create_signed_url(unique_filename, 3600 * 24 * 365)  # 1 year expiry
            if isinstance(signed_url_response, dict):
                signed_url = signed_url_response.get("signedURL") or signed_url_response.get("signed_url")
            else:
                signed_url = signed_url_response
        except Exception as url_error:
            print(f"Warning: Could not get signed URL: {str(url_error)}")
            signed_url = None
        
        return {
            "file_url": signed_url,
            "file_name": file.filename or "attachment",
            "file_size": file_size,
            "message_type": "image" if file.content_type and file.content_type.startswith("image/") else "file"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@router.patch("/conversations/{conversation_id}/status")
async def update_conversation_status(
    conversation_id: str,
    status: str = Query(..., description="New status: active, resolved, or archived"),
    user = Depends(get_current_user)
):
    """Update conversation status. Only admins can update status."""
    try:
        # Only admins can update conversation status
        is_admin = user.get("role") == "admin"
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can update conversation status")
        
        # Validate status
        valid_statuses = ["active", "resolved", "archived"]
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        
        # Verify conversation exists
        conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", conversation_id).single().execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Update status
        update_response = supabase_storage.table("chat_conversations").update({
            "status": status,
            "updated_at": datetime.now().isoformat()
        }).eq("id", conversation_id).execute()
        
        if not update_response.data:
            raise HTTPException(status_code=500, detail="Failed to update conversation status")
        
        return {"message": f"Conversation status updated to {status}", "status": status}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating conversation status: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update conversation status: {str(e)}")

@router.patch("/conversations/{conversation_id}/mode")
async def update_chat_mode(
    conversation_id: str,
    mode_data: dict,
    user = Depends(get_current_user)
):
    """
    Update chat mode for a conversation (ai or human).
    Only customers can update their own conversation mode.
    """
    try:
        chat_mode = mode_data.get("chat_mode")
        if chat_mode not in ["ai", "human"]:
            raise HTTPException(status_code=400, detail="chat_mode must be 'ai' or 'human'")
        
        # Verify conversation exists and user has access
        conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", conversation_id).single().execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conv = conv_response.data
        is_admin = user.get("role") == "admin"
        
        # Only customers can update their own conversation mode
        if not is_admin and conv["customer_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Update chat mode
        update_response = supabase_storage.table("chat_conversations").update({
            "chat_mode": chat_mode,
            "updated_at": datetime.now().isoformat()
        }).eq("id", conversation_id).execute()
        
        if not update_response.data:
            raise HTTPException(status_code=500, detail="Failed to update chat mode")
        
        logger.info(f"Updated chat mode to '{chat_mode}' for conversation {conversation_id} by user {user['id']}")
        
        return {"message": "Chat mode updated successfully", "chat_mode": chat_mode}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating chat mode: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update chat mode: {str(e)}")

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """Delete a conversation. Only admins can delete conversations."""
    try:
        # Only admins can delete conversations
        is_admin = user.get("role") == "admin"
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can delete conversations")
        
        # Verify conversation exists
        conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", conversation_id).single().execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Delete conversation (messages will be cascade deleted due to foreign key constraint)
        delete_response = supabase_storage.table("chat_conversations").delete().eq("id", conversation_id).execute()
        
        return {"message": "Conversation deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete conversation: {str(e)}")

@router.post("/cleanup", response_model=dict)
async def cleanup_chat_history(
    retention_hours: Optional[int] = Query(None, description="Number of hours to retain (default: from env or 48)"),
    user = Depends(get_current_admin)
):
    """
    Manually trigger cleanup of old chat history (Admin only)
    
    Deletes chat messages and conversations older than the retention period.
    Default retention is 48 hours, configurable via CHAT_RETENTION_HOURS env var.
    """
    try:
        stats = cleanup_old_chat_history(retention_hours=retention_hours)
        return {
            "success": True,
            "message": "Chat cleanup completed",
            "stats": stats
        }
    except Exception as e:
        logger.error(f"Error in chat cleanup endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to cleanup chat history: {str(e)}")

@router.post("/conversations/{conversation_id}/ai-response", response_model=ChatMessage)
async def generate_ai_response(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """
    Generate AI response for a conversation.
    This endpoint can be called after a customer sends a message to get an AI response.
    NOTE: Admins cannot trigger AI responses - they can only view conversations.
    """
    try:
        # Verify conversation exists and user has access
        conv_response = supabase_storage.table("chat_conversations").select("*").eq("id", conversation_id).single().execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conv = conv_response.data
        is_admin = user.get("role") == "admin"
        
        # Block admins from triggering AI responses
        if is_admin:
            raise HTTPException(
                status_code=403, 
                detail="Admins cannot trigger AI responses. AI responses are automatically generated for customer messages."
            )
        
        # Check access - only customers can trigger AI responses for their own conversations
        if conv["customer_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")

        # Respect chat_mode: customers cannot trigger AI responses when set to human support.
        if conv.get("chat_mode") == "human":
            raise HTTPException(status_code=409, detail="Chat is currently in human support mode. Switch back to AI mode to receive automated responses.")

        request_id = str(uuid.uuid4())
        
        # Get recent messages for context
        messages_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=True).limit(10).execute()
        messages = messages_response.data if messages_response.data else []
        
        if not messages:
            raise HTTPException(status_code=400, detail="No messages found in conversation")
        
        # Get the most recent user message (not from AI)
        latest_message = None
        for msg in messages:
            if msg.get("sender_id") != OCHO_USER_ID and msg.get("message"):
                latest_message = msg
                break
        
        if not latest_message:
            raise HTTPException(status_code=400, detail="No user message found to respond to")
        
        user_query = latest_message.get("message", "")
        attachments = []

        # Attachment-aware query enrichment (optional; can be disabled)
        if os.getenv("ENABLE_CHAT_ATTACHMENT_PROCESSING", "true").lower() in ("1", "true", "yes"):
            try:
                msg_type = (latest_message.get("message_type") or "text").lower()
                file_url = latest_message.get("file_url")
                file_name = latest_message.get("file_name")

                if file_url and msg_type in ("file", "image"):
                    downloaded = download_attachment(file_url, file_name=file_name)
                    if downloaded:
                        if msg_type == "image":
                            # Multimodal path
                            attachments.append({"kind": "image", "data": downloaded.data, "mime_type": downloaded.mime_type})
                            user_query = (user_query or "").strip() or "Please describe the attached image."
                            user_query += f"\n\n(Attached image: {file_name or 'image'})"
                        else:
                            extracted = extract_text_from_attachment_bytes(downloaded.data, downloaded.mime_type, file_name=file_name)
                            if extracted:
                                user_query = (user_query or "").strip()
                                user_query += f"\n\nAttachment ({file_name or 'file'}):\n{extracted}"
                            else:
                                user_query = (user_query or "").strip()
                                user_query += f"\n\n(Attached file: {file_name or 'file'})"
            except Exception as e:
                logger.warning(f"Attachment processing failed (non-fatal): {str(e)}")
        
        # Format conversation history (excluding the current message we're responding to)
        conversation_history = []
        for msg in reversed(messages):
            if msg.get("id") == latest_message.get("id"):
                continue  # Skip the message we're responding to
            
            sender_id = msg.get("sender_id", "")
            content = msg.get("message", "")
            
            if content and sender_id:
                # Determine role: "user" for customer/admin, "model" for AI
                if sender_id == OCHO_USER_ID:
                    role = "model"
                else:
                    role = "user"
                
                conversation_history.append({
                    "role": role,
                    "content": content
                })
        
        # Retrieve relevant context using RAG
        # SECURITY: Always pass customer_id and is_admin flag for proper data isolation
        rag_service = get_rag_service()
        customer_id = conv.get("customer_id")
        
        # For customer conversations, use the conversation's customer_id
        # For admin requests, we still need customer_id to filter data properly
        context = rag_service.retrieve_context(
            user_query, 
            customer_id=customer_id,
            is_admin=is_admin
        )

        # Fetch rolling conversation summary (optional; requires DB migration)
        conversation_summary = ""
        try:
            summary_resp = supabase_storage.table("chat_conversations").select("summary").eq("id", conversation_id).single().execute()
            if summary_resp.data and summary_resp.data.get("summary"):
                conversation_summary = summary_resp.data.get("summary") or ""
        except Exception:
            conversation_summary = ""
        
        # Get customer-specific context
        customer_context = None
        if customer_id:
            try:
                client_response = supabase_storage.table("clients").select("name, company").eq("user_id", customer_id).single().execute()
                if client_response.data:
                    customer_context = {
                        "company": client_response.data.get("company"),
                        "name": client_response.data.get("name")
                    }
            except Exception as e:
                logger.warning(f"Error getting customer context: {str(e)}")
        
        # Get admin user ID for action execution (if user is admin, use their ID; otherwise find an admin)
        admin_user_id = None
        if is_admin:
            admin_user_id = user["id"]
        else:
            # Find an admin user to use for AI actions
            try:
                admin_role_response = supabase_storage.table("user_roles").select("user_id").eq("role", "admin").limit(1).execute()
                if admin_role_response.data:
                    admin_user_id = admin_role_response.data[0]["user_id"]
            except Exception as e:
                logger.warning(f"Could not find admin user for AI actions: {str(e)}")
        
        # Enable function calling if we have an admin user ID
        enable_function_calling = admin_user_id is not None
        
        # Generate AI response
        try:
            ai_service = get_ai_service()
            if not ai_service:
                logger.error("AI service is not available")
                raise HTTPException(status_code=503, detail="AI service is not configured. Please set GEMINI_API_KEY environment variable.")
            
            ai_result = ai_service.generate_response(
                user_message=user_query,
                conversation_history=conversation_history,
                context=context,
                conversation_summary=conversation_summary,
                customer_context=customer_context,
                attachments=attachments,
                enable_function_calling=enable_function_calling
            )
            
            # Handle response format (backward compatibility)
            if isinstance(ai_result, str):
                ai_response = ai_result
                function_calls = []
            else:
                ai_response = ai_result.get("response", "")
                function_calls = ai_result.get("function_calls", [])
        except HTTPException:
            raise
        except ValueError as e:
            # AI service not configured
            logger.error(f"AI service not available: {str(e)}")
            raise HTTPException(status_code=503, detail="AI service is not configured. Please set GEMINI_API_KEY environment variable.")
        except Exception as e:
            logger.error(f"Error generating AI response: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to generate AI response: {str(e)}")
        
        # Execute function calls if any
        execution_results = []
        if function_calls and admin_user_id:
            try:
                action_executor = AIActionExecutor(admin_user_id)
                
                # Get the user's message for validation
                user_message = user_query  # Use the user_query directly
                
                # Get client_id from customer context if available
                client_id = None
                if customer_id:
                    try:
                        client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
                        if client_response.data:
                            client_id = client_response.data["id"]
                    except Exception as e:
                        logger.warning(f"Could not get client_id: {str(e)}")
                
                for func_call in function_calls:
                    func_name = func_call.get("name", "").strip()
                    func_params = func_call.get("arguments", {})
                    
                    # Skip function calls with empty or missing names
                    if not func_name:
                        logger.warning(f"Skipping function call with empty name. Function call data: {func_call}")
                        continue
                    
                    # Convert any MapComposite or proto objects to dicts
                    func_params = _convert_proto_to_dict(func_params)

                    # Enrich get_availability if the model omitted common params (e.g. user asked "today").
                    if func_name == "get_availability":
                        try:
                            if not func_params.get("date_from") and not func_params.get("date_to"):
                                inferred = _infer_date_range_from_text(user_message_for_validation or "")
                                if inferred:
                                    func_params.update(inferred)
                        except Exception:
                            pass
                    
                    # Ensure line_items is properly converted (if present)
                    if "line_items" in func_params:
                        line_items = func_params["line_items"]
                        # If it's a string, try to parse it as JSON
                        if isinstance(line_items, str):
                            try:
                                import json
                                line_items = json.loads(line_items)
                                func_params["line_items"] = line_items
                            except (json.JSONDecodeError, ValueError) as e:
                                logger.error(f"Could not parse line_items as JSON: {e}")
                                logger.error(f"line_items value: {line_items}")
                                # Remove invalid line_items to prevent error
                                del func_params["line_items"]
                        
                        # If it's a list, ensure each item is a dict
                        if isinstance(func_params.get("line_items"), list):
                            func_params["line_items"] = [
                                item if isinstance(item, dict) else _convert_proto_to_dict(item)
                                for item in func_params["line_items"]
                            ]
                    
                    # ALWAYS override client_id with the one from conversation context (don't trust AI-generated IDs)
                    if client_id:
                        func_params["client_id"] = client_id
                        logger.info(f"Using client_id from conversation context: {client_id}")
                    
                    # Log detailed function parameters for debugging
                    logger.info(f"Executing function: {func_name}")
                    logger.info(f"Function params keys: {list(func_params.keys())}")
                    if "line_items" in func_params:
                        logger.info(f"line_items type: {type(func_params['line_items'])}, length: {len(func_params['line_items']) if isinstance(func_params['line_items'], list) else 'N/A'}, value: {func_params['line_items']}")
                    else:
                        logger.warning(f"⚠️ line_items MISSING from function params! Available keys: {list(func_params.keys())}")
                    logger.info(f"Full params (sanitized): { {k: v for k, v in func_params.items() if k != 'client_id'} }")
                    
                    # Get user message for validation (get from most recent customer message)
                    user_message_for_validation = user_message
                    try:
                        if customer_id:
                            recent_msg_response = supabase_storage.table("chat_messages").select("message").eq("conversation_id", conversation_id).eq("sender_id", customer_id).order("created_at", desc=True).limit(1).execute()
                            if recent_msg_response.data:
                                user_message_for_validation = recent_msg_response.data[0].get("message")
                    except Exception:
                        pass
                    
                    result = action_executor.execute_function(func_name, func_params, user_message=user_message_for_validation)
                    execution_results.append({
                        "function": func_name,
                        "success": result.get("success", False),
                        "result": result.get("result"),
                        "error": result.get("error")
                    })
                    
                    # If we just fetched availability, immediately follow up with a 2nd message containing times.
                    # This prevents the chat from stalling on "Let me check..." without showing options.
                    if func_name == "get_availability" and result.get("success"):
                        try:
                            raw = result.get("result") or {}
                            tz = _infer_timezone_from_text(user_message_for_validation or "")
                            duration = _event_duration_minutes(func_params.get("event_type_id"))
                            slots = _extract_slots_from_availability(raw, duration)[:15]
                            _set_pending_action(conversation_id, {
                                "type": "scheduling",
                                "step": "choose_time",
                                "event_type_id": func_params.get("event_type_id"),
                                "timezone": tz,
                                "availability": slots,
                            })
                            _insert_ai_message(conversation_id, _render_availability_message(slots, tz, limit=10))
                        except Exception as e:
                            logger.warning(f"Failed to post availability follow-up: {str(e)}", exc_info=True)

                    # Persist audit log for AI actions (optional; requires DB migration)
                    try:
                        if os.getenv("ENABLE_AI_ACTION_AUDIT", "true").lower() in ("1", "true", "yes"):
                            supabase_storage.table("chat_ai_action_logs").insert({
                                "id": str(uuid.uuid4()),
                                "request_id": request_id,
                                "conversation_id": conversation_id,
                                "trigger_message_id": latest_message.get("id"),
                                "function_name": func_name,
                                "parameters": {k: v for k, v in (func_params or {}).items() if k != "client_id"},
                                "success": bool(result.get("success", False)),
                                "result": result.get("result"),
                                "error": result.get("error"),
                                "created_at": datetime.now().isoformat()
                            }).execute()
                    except Exception as e:
                        logger.debug(f"AI action audit insert failed (non-fatal): {str(e)}")

                    # If the action was blocked for confirmation, ask the customer explicitly and stop further action processing.
                    if func_name == "create_quote" and result.get("requires_confirmation"):
                        ai_response = result.get("error") or "Before I create a quote, please confirm you'd like me to proceed."
                        break
                    
                    # Folder order status tool (customer clarity)
                    if func_name == "get_folder_status" and result.get("success"):
                        try:
                            info = result.get("result") or {}
                            stage = info.get("stage")
                            next_step = info.get("next_step")
                            owner = info.get("next_step_owner")
                            shipping = info.get("shipping") or {}
                            eta = shipping.get("actual_delivery_date") or shipping.get("estimated_delivery_date")
                            quote_number = info.get("quote_number")
                            deep_link = info.get("deep_link") or ""

                            lines = []
                            lines.append("Here’s the latest status for your order:")
                            if quote_number:
                                lines.append(f"- Quote: {quote_number}")
                            if stage:
                                lines.append(f"- Stage: {stage}")
                            if next_step:
                                lines.append(f"- Next step: {next_step}" + (f" ({owner})" if owner else ""))
                            if eta:
                                lines.append(f"- {'Delivered' if shipping.get('actual_delivery_date') else 'ETA'}: {eta}")
                            if deep_link:
                                lines.append(f"\nOpen your order folder: {deep_link}")
                            ai_response = "\n".join(lines)
                        except Exception:
                            ai_response = result.get("message") or "Here’s the latest status for your order."
                        break

                    # If quote was created, replace the fallback message with a detailed quote overview
                    if func_name == "create_quote" and result.get("success"):
                        quote_info = result.get("result", {})
                        quote_id = quote_info.get("quote_id", "")
                        folder_id = quote_info.get("folder_id", "")
                        
                        # Fetch full quote details for detailed message
                        try:
                            quote_response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).single().execute()
                            if quote_response.data:
                                quote = quote_response.data
                                quote_title = quote.get("title", "New Quote")
                                client = quote.get("clients", {})
                                company_name = client.get("company", client.get("name", ""))
                                line_items = quote.get("line_items", [])
                                tax_rate = quote.get("tax_rate", "0")
                                tax_amount = quote.get("tax_amount", "0")
                                total = quote.get("total", "0")
                                
                                # Format tax rate as percentage
                                try:
                                    tax_rate_decimal = Decimal(str(tax_rate))
                                    tax_rate_display = f"{tax_rate_decimal}%"
                                except:
                                    tax_rate_display = f"{tax_rate}%"
                                
                                # Build detailed message with elegant formatting
                                ai_response = "I've created your quote, and everything is set up for you to view inside of the quote's folder! You can view the folder in your customer dashboard.\n\n"
                                ai_response += "**Quote Overview:**\n\n"
                                ai_response += f"**{quote_title}**\n\n"
                                
                                # Calculate subtotal from line items
                                subtotal = Decimal("0")
                                for item in line_items:
                                    try:
                                        qty = Decimal(str(item.get("quantity", 0)))
                                        price = Decimal(str(item.get("unit_price", "0")))
                                        subtotal += qty * price
                                    except:
                                        pass
                                
                                # Add line items with cleaner formatting
                                for item in line_items:
                                    description = item.get("description", "")
                                    quantity = item.get("quantity", 0)
                                    unit_price = item.get("unit_price", "0")
                                    try:
                                        qty = Decimal(str(quantity))
                                        price = Decimal(str(unit_price))
                                        line_total = qty * price
                                        ai_response += f"• {description}\n"
                                        ai_response += f"  {int(qty)} × ${price:.2f} = ${line_total:.2f}\n\n"
                                    except:
                                        ai_response += f"• {description}\n"
                                        ai_response += f"  {quantity} × ${unit_price}\n\n"
                                
                                # Format totals section
                                try:
                                    subtotal_decimal = Decimal(str(subtotal))
                                    tax_decimal = Decimal(str(tax_amount))
                                    total_decimal = Decimal(str(total))
                                    ai_response += "---\n"
                                    ai_response += f"Subtotal: ${subtotal_decimal:.2f}\n"
                                    ai_response += f"Tax ({tax_rate_display}): ${tax_decimal:.2f}\n"
                                    ai_response += f"**Total: ${total_decimal:.2f}**"
                                except:
                                    ai_response += "---\n"
                                    ai_response += f"Tax ({tax_rate_display}): ${tax_amount}\n"
                                    ai_response += f"**Total: ${total}**"
                            else:
                                # Fallback if quote fetch fails
                                quote_number = quote_info.get("quote_number", "")
                                ai_response = f"I've created your quote, and everything is set up for you to view inside of the quote's folder! You can view the folder in your customer dashboard."
                        except Exception as e:
                            logger.warning(f"Could not fetch quote details for message: {str(e)}")
                            # Fallback if quote fetch fails
                            quote_number = quote_info.get("quote_number", "")
                            ai_response = f"I've created your quote, and everything is set up for you to view inside of the quote's folder! You can view the folder in your customer dashboard."

                        # Add lightweight “action card” links (if FRONTEND_URL is configured)
                        try:
                            frontend_url = (os.getenv("FRONTEND_URL") or "").rstrip("/")
                            if frontend_url and folder_id:
                                folder_link = f"{frontend_url}/folders/{folder_id}"
                                quote_link = f"{frontend_url}/quotes/{quote_id}" if quote_id else ""
                                ai_response = (
                                    "✅ **Quote created**\n\n"
                                    f"- [View folder]({folder_link})\n"
                                    + (f"- [View quote]({quote_link})\n" if quote_link else "")
                                    + "\n"
                                    + ai_response
                                )
                        except Exception:
                            pass
                        
                        # Auto-assign appropriate design form based on order type
                        if folder_id and "line_items" in func_params:
                            try:
                                line_items = func_params.get("line_items", [])
                                if isinstance(line_items, list) and len(line_items) > 0:
                                    # Determine order type from line items
                                    order_type = _detect_order_type(line_items)
                                    form_slug = None
                                    
                                    if order_type == "hat":
                                        form_slug = "form-4f8ml8om"  # Custom Hat Design Form
                                    elif order_type == "coozie":
                                        form_slug = "form-rwljka86"  # Custom Coozie Design Form
                                    
                                    if form_slug:
                                        assign_result = action_executor.execute_function("assign_form_to_folder", {
                                            "folder_id": folder_id,
                                            "form_slug": form_slug
                                        }, user_message=None)
                                        # Form is automatically added to folder - no need to mention it in response
                                        logger.info(f"Auto-assigned {form_slug} to folder {folder_id} for {order_type} order")
                            except Exception as e:
                                logger.warning(f"Could not auto-assign form: {str(e)}")
                    
                    # If function failed, update response with error info
                    elif not result.get("success"):
                        error_msg = result.get("error", "Unknown error")
                        if ai_response == "I'll help you with that. Let me create the quote and set everything up for you.":
                            ai_response = f"I encountered an issue while trying to create your quote: {error_msg}. Please try again or contact support."
                        else:
                            ai_response += f"\n\n⚠️ Note: There was an issue: {error_msg}"
            
            except Exception as e:
                logger.error(f"Error executing function calls: {str(e)}", exc_info=True)
                # Don't fail the whole request, just log the error
        
        # Create AI message in the conversation
        ai_message_data = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "sender_id": OCHO_USER_ID,  # Ocho (AI assistant) user ID
            "message": ai_response,
            "message_type": "text",
            "created_at": datetime.now().isoformat()
        }
        
        message_response = supabase_storage.table("chat_messages").insert(ai_message_data).execute()
        if not message_response.data:
            raise HTTPException(status_code=500, detail="Failed to save AI response")

        # Update rolling conversation summary (optional; can be disabled)
        try:
            if os.getenv("ENABLE_CHAT_SUMMARY", "true").lower() in ("1", "true", "yes"):
                prev = conversation_summary
                summary_messages = conversation_history + [
                    {"role": "user", "content": user_query},
                    {"role": "model", "content": ai_response},
                ]
                new_summary = ai_service.summarize_conversation(prev, summary_messages)
                if new_summary and new_summary != prev:
                    supabase_storage.table("chat_conversations").update({
                        "summary": new_summary,
                        "summary_updated_at": datetime.now().isoformat()
                    }).eq("id", conversation_id).execute()
        except Exception as e:
            logger.debug(f"Failed to update chat summary for conversation {conversation_id}: {str(e)}")
        
        # Update conversation timestamp
        try:
            supabase_storage.table("chat_conversations").update({
                "last_message_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }).eq("id", conversation_id).execute()
        except Exception as e:
            logger.warning(f"Failed to update conversation timestamp: {str(e)}")
        
        return message_response.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating AI response: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate AI response: {str(e)}")


async def _generate_ai_response_async(
    conversation_id: str,
    customer_id: str,
    placeholder_message_id: Optional[str] = None,
    customer_message_id: Optional[str] = None
) -> None:
    """Asynchronously generate AI response for a customer message"""
    request_id = str(uuid.uuid4())
    # These are used later when finalizing the placeholder message.
    file_message_override: Optional[Dict[str, Any]] = None
    created_quote_id: Optional[str] = None
    created_folder_id: Optional[str] = None
    def _delete_placeholder() -> None:
        if not placeholder_message_id:
            return
        try:
            supabase_storage.table("chat_messages").delete().eq("id", placeholder_message_id).execute()
        except Exception as e:
            logger.warning(f"⚠️ [AI TASK] Failed to delete placeholder message {placeholder_message_id}: {str(e)}")

    def _update_placeholder_to_error(error_text: str) -> None:
        if not placeholder_message_id:
            return
        try:
            supabase_storage.table("chat_messages").update({
                "message": error_text,
                "message_type": "text"
            }).eq("id", placeholder_message_id).execute()
        except Exception as e:
            logger.warning(f"⚠️ [AI TASK] Failed to update placeholder message {placeholder_message_id}: {str(e)}")

    # Use print as well as logger to ensure we see this in logs
    print(f"🤖 [AI TASK] Starting AI response generation (request_id={request_id}) for conversation {conversation_id}, customer {customer_id}")
    logger.info(f"🤖 [AI TASK] Starting AI response generation (request_id={request_id}) for conversation {conversation_id}, customer {customer_id}")
    try:
        # Small delay to ensure message is saved
        logger.info(f"Waiting 1.5 seconds before generating AI response...")
        await asyncio.sleep(1.5)
        logger.info(f"Delay complete, proceeding with AI response generation")

        # Respect chat_mode: if set to human, do not respond with AI.
        try:
            mode_resp = supabase_storage.table("chat_conversations").select("chat_mode").eq("id", conversation_id).single().execute()
            chat_mode = (mode_resp.data or {}).get("chat_mode") or "ai"
        except Exception:
            chat_mode = "ai"
        if chat_mode == "human":
            logger.info(f"Chat mode is 'human' for conversation {conversation_id}; skipping AI response generation")
            _delete_placeholder()
            return
        
        # Chat mode check removed - always AI
        
        # Check again if admin has responded (race condition check)
        recent_messages_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=True).limit(3).execute()
        recent_messages = recent_messages_response.data if recent_messages_response.data else []
        
        # If most recent message is from admin (verify by checking user_roles), skip AI response
        if recent_messages:
            latest = recent_messages[0]
            latest_sender_id = latest.get("sender_id")
            
            # Skip if sender is the customer or AI
            if latest_sender_id != customer_id and latest_sender_id != OCHO_USER_ID:
                # Verify sender is actually an admin
                try:
                    role_response = supabase_storage.table("user_roles").select("role").eq("user_id", latest_sender_id).single().execute()
                    if role_response.data and role_response.data.get("role") == "admin":
                        logger.info(f"Admin {latest_sender_id} responded, skipping AI response for conversation {conversation_id}")
                        _delete_placeholder()
                        return
                except Exception as role_check_error:
                    # If we can't verify, log but don't assume it's an admin - proceed with AI response
                    logger.debug(f"Could not verify role for sender {latest_sender_id}: {str(role_check_error)}")
        
        # Get recent messages for context
        messages_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=True).limit(10).execute()
        messages = messages_response.data if messages_response.data else []
        
        if not messages:
            _delete_placeholder()
            return
        
        # Get the most recent customer message
        latest_customer_message = None
        for msg in messages:
            if msg.get("sender_id") == customer_id and msg.get("message"):
                latest_customer_message = msg
                break
        
        if not latest_customer_message:
            _delete_placeholder()
            return
        
        user_query = latest_customer_message.get("message", "")
        attachments = []

        # Attachment-aware query enrichment (optional; can be disabled)
        if os.getenv("ENABLE_CHAT_ATTACHMENT_PROCESSING", "true").lower() in ("1", "true", "yes"):
            try:
                msg_type = (latest_customer_message.get("message_type") or "text").lower()
                file_url = latest_customer_message.get("file_url")
                file_name = latest_customer_message.get("file_name")

                if file_url and msg_type in ("file", "image"):
                    downloaded = download_attachment(file_url, file_name=file_name)
                    if downloaded:
                        if msg_type == "image":
                            attachments.append({"kind": "image", "data": downloaded.data, "mime_type": downloaded.mime_type})
                            user_query = (user_query or "").strip() or "Please describe the attached image."
                            user_query += f"\n\n(Attached image: {file_name or 'image'})"
                        else:
                            extracted = extract_text_from_attachment_bytes(downloaded.data, downloaded.mime_type, file_name=file_name)
                            if extracted:
                                user_query = (user_query or "").strip()
                                user_query += f"\n\nAttachment ({file_name or 'file'}):\n{extracted}"
                            else:
                                user_query = (user_query or "").strip()
                                user_query += f"\n\n(Attached file: {file_name or 'file'})"
            except Exception as e:
                logger.warning(f"Attachment processing failed (non-fatal): {str(e)}")
        
        # Format conversation history
        conversation_history = []
        for msg in reversed(messages):
            if msg.get("id") == latest_customer_message.get("id"):
                continue
            
            sender_id = msg.get("sender_id", "")
            content = msg.get("message", "")
            
            if content and sender_id:
                if sender_id == OCHO_USER_ID:
                    role = "model"
                else:
                    role = "user"
                
                conversation_history.append({
                    "role": role,
                    "content": content
                })
        
        # Retrieve context using RAG
        rag_service = get_rag_service()
        logger.info(f"Retrieving context for query: '{user_query[:100]}...'")
        context = rag_service.retrieve_context(
            user_query,
            customer_id=customer_id,
            is_admin=False
        )
        logger.info(f"Context retrieved: {len(context)} characters")

        # Fetch rolling conversation summary (optional; requires DB migration)
        conversation_summary = ""
        try:
            summary_resp = supabase_storage.table("chat_conversations").select("summary").eq("id", conversation_id).single().execute()
            if summary_resp.data and summary_resp.data.get("summary"):
                conversation_summary = summary_resp.data.get("summary") or ""
        except Exception:
            conversation_summary = ""
        
        # Get customer context
        customer_context = None
        if customer_id:
            try:
                client_response = supabase_storage.table("clients").select("name, company").eq("user_id", customer_id).single().execute()
                if client_response.data:
                    customer_context = {
                        "company": client_response.data.get("company"),
                        "name": client_response.data.get("name")
                    }
            except Exception as e:
                logger.warning(f"Error getting customer context: {str(e)}")
        
        # Get admin user ID for action execution
        admin_user_id = None
        try:
            admin_role_response = supabase_storage.table("user_roles").select("user_id").eq("role", "admin").limit(1).execute()
            if admin_role_response.data:
                admin_user_id = admin_role_response.data[0]["user_id"]
        except Exception as e:
            logger.warning(f"Could not find admin user for AI actions: {str(e)}")
        
        # Enable function calling if we have an admin user ID
        enable_function_calling = admin_user_id is not None
        
        # Generate AI response
        try:
            print(f"🤖 [AI TASK] Getting AI service...")
            logger.info(f"🤖 [AI TASK] Getting AI service...")
            ai_service = get_ai_service()
            if not ai_service:
                print(f"❌ [AI TASK] AI service is not available")
                logger.error(f"❌ [AI TASK] AI service is not available")
                _update_placeholder_to_error("Reel48 AI is temporarily unavailable right now. Please try again in a moment.")
                return
            print(f"🤖 [AI TASK] AI service obtained, generating response for query: '{user_query[:100]}...'")
            logger.info(f"🤖 [AI TASK] AI service obtained, generating response for query: '{user_query[:100]}...'")
            logger.info(f"🤖 [AI TASK] Context retrieved (length: {len(context)} chars)")
            print(f"🤖 [AI TASK] Calling generate_response...")
            ai_result = ai_service.generate_response(
                user_message=user_query,
                conversation_history=conversation_history,
                context=context,
                conversation_summary=conversation_summary,
                customer_context=customer_context,
                attachments=attachments,
                enable_function_calling=enable_function_calling
            )
            
            # Handle response format (backward compatibility)
            if isinstance(ai_result, str):
                ai_response = ai_result
                function_calls = []
            else:
                ai_response = ai_result.get("response", "")
                function_calls = ai_result.get("function_calls", [])
            
            print(f"🤖 [AI TASK] Response received: {len(ai_response) if ai_response else 0} chars, {len(function_calls)} function calls")
            if not ai_response or len(ai_response.strip()) == 0:
                print(f"⚠️ [AI TASK] AI service returned empty response")
                logger.warning(f"⚠️ [AI TASK] AI service returned empty response")
                _update_placeholder_to_error("Reel48 AI returned an empty response. Please try again.")
                return
            print(f"✅ [AI TASK] AI response generated successfully (length: {len(ai_response)} chars)")
            logger.info(f"✅ [AI TASK] AI response generated successfully (length: {len(ai_response)} chars)")
        except ValueError as ve:
            print(f"❌ [AI TASK] AI service not configured: {str(ve)}")
            logger.error(f"❌ [AI TASK] AI service not configured: {str(ve)}", exc_info=True)
            _update_placeholder_to_error("Reel48 AI is temporarily unavailable right now. Please try again in a moment.")
            return
        except Exception as ai_error:
            print(f"❌ [AI TASK] Error calling AI service: {str(ai_error)}")
            logger.error(f"❌ [AI TASK] Error calling AI service: {str(ai_error)}", exc_info=True)
            import traceback
            print(f"❌ [AI TASK] Traceback: {traceback.format_exc()}")
            _update_placeholder_to_error("Reel48 AI ran into an error generating a response. Please try again.")
            return
        
        # Execute function calls if any
        if function_calls and admin_user_id:
            try:
                action_executor = AIActionExecutor(admin_user_id)
                
                # Get client_id from customer
                client_id = None
                try:
                    client_response = supabase_storage.table("clients").select("id").eq("user_id", customer_id).single().execute()
                    if client_response.data:
                        client_id = client_response.data["id"]
                except Exception as e:
                    logger.warning(f"Could not get client_id: {str(e)}")
                
                for func_call in function_calls:
                    func_name = func_call.get("name", "").strip()
                    func_params = func_call.get("arguments", {})
                    
                    # Skip function calls with empty or missing names
                    if not func_name:
                        logger.warning(f"Skipping function call with empty name. Function call data: {func_call}")
                        continue
                    
                    # Convert any MapComposite or proto objects to dicts
                    func_params = _convert_proto_to_dict(func_params)

                    # Enrich get_availability if the model omitted common params (e.g. user asked "today").
                    if func_name == "get_availability":
                        try:
                            if not func_params.get("date_from") and not func_params.get("date_to"):
                                inferred = _infer_date_range_from_text(user_query or "")
                                if inferred:
                                    func_params.update(inferred)
                        except Exception:
                            pass
                    
                    # Ensure line_items is properly converted (if present)
                    if "line_items" in func_params:
                        line_items = func_params["line_items"]
                        # If it's a string, try to parse it as JSON
                        if isinstance(line_items, str):
                            try:
                                import json
                                line_items = json.loads(line_items)
                                func_params["line_items"] = line_items
                            except (json.JSONDecodeError, ValueError) as e:
                                logger.error(f"Could not parse line_items as JSON: {e}")
                                logger.error(f"line_items value: {line_items}")
                                # Remove invalid line_items to prevent error
                                del func_params["line_items"]
                        
                        # If it's a list, ensure each item is a dict
                        if isinstance(func_params.get("line_items"), list):
                            func_params["line_items"] = [
                                item if isinstance(item, dict) else _convert_proto_to_dict(item)
                                for item in func_params["line_items"]
                            ]
                    
                    # ALWAYS override client_id with the one from conversation context (don't trust AI-generated IDs)
                    if client_id:
                        func_params["client_id"] = client_id
                        logger.info(f"Using client_id from conversation context: {client_id}")
                    
                    # Log detailed function parameters for debugging
                    logger.info(f"Executing function: {func_name}")
                    logger.info(f"Function params keys: {list(func_params.keys())}")
                    if "line_items" in func_params:
                        logger.info(f"line_items type: {type(func_params['line_items'])}, length: {len(func_params['line_items']) if isinstance(func_params['line_items'], list) else 'N/A'}, value: {func_params['line_items']}")
                    else:
                        logger.warning(f"⚠️ line_items MISSING from function params! Available keys: {list(func_params.keys())}")
                    logger.info(f"Full params (sanitized): { {k: v for k, v in func_params.items() if k != 'client_id'} }")
                    
                    # Get user message for validation
                    result = action_executor.execute_function(func_name, func_params, user_message=user_query)

                    # If we just fetched availability, immediately follow up with a 2nd message containing times.
                    if func_name == "get_availability" and result.get("success"):
                        try:
                            raw = result.get("result") or {}
                            tz = _infer_timezone_from_text(user_query or "")
                            duration = _event_duration_minutes(func_params.get("event_type_id"))
                            slots = _extract_slots_from_availability(raw, duration)[:15]
                            _set_pending_action(conversation_id, {
                                "type": "scheduling",
                                "step": "choose_time",
                                "event_type_id": func_params.get("event_type_id"),
                                "timezone": tz,
                                "availability": slots,
                            })
                            _insert_ai_message(conversation_id, _render_availability_message(slots, tz, limit=10))
                        except Exception as e:
                            logger.warning(f"Failed to post availability follow-up: {str(e)}", exc_info=True)

                    # Persist audit log for AI actions (optional; requires DB migration)
                    try:
                        if os.getenv("ENABLE_AI_ACTION_AUDIT", "true").lower() in ("1", "true", "yes"):
                            supabase_storage.table("chat_ai_action_logs").insert({
                                "id": str(uuid.uuid4()),
                                "request_id": request_id,
                                "conversation_id": conversation_id,
                                "trigger_message_id": latest_customer_message.get("id"),
                                "function_name": func_name,
                                "parameters": {k: v for k, v in (func_params or {}).items() if k != "client_id"},
                                "success": bool(result.get("success", False)),
                                "result": result.get("result"),
                                "error": result.get("error"),
                                "created_at": datetime.now().isoformat()
                            }).execute()
                    except Exception as e:
                        logger.debug(f"AI action audit insert failed (non-fatal): {str(e)}")

                    # If the action was blocked for confirmation, ask the customer explicitly and stop further action processing.
                    if func_name == "create_quote" and result.get("requires_confirmation"):
                        ai_response = result.get("error") or "Before I create a quote, please confirm you'd like me to proceed."
                        break
                    
                    # Update response with results
                    if func_name == "get_folder_status" and result.get("success"):
                        try:
                            info = result.get("result") or {}
                            stage = info.get("stage")
                            next_step = info.get("next_step")
                            owner = info.get("next_step_owner")
                            shipping = info.get("shipping") or {}
                            eta = shipping.get("actual_delivery_date") or shipping.get("estimated_delivery_date")
                            quote_number = info.get("quote_number")
                            deep_link = info.get("deep_link") or ""

                            lines = []
                            lines.append("Here’s the latest status for your order:")
                            if quote_number:
                                lines.append(f"- Quote: {quote_number}")
                            if stage:
                                lines.append(f"- Stage: {stage}")
                            if next_step:
                                lines.append(f"- Next step: {next_step}" + (f" ({owner})" if owner else ""))
                            if eta:
                                lines.append(f"- {'Delivered' if shipping.get('actual_delivery_date') else 'ETA'}: {eta}")
                            if deep_link:
                                lines.append(f"\nOpen your order folder: {deep_link}")
                            ai_response = "\n".join(lines)
                        except Exception:
                            ai_response = result.get("message") or "Here’s the latest status for your order."
                        break

                    if func_name == "create_quote" and result.get("success"):
                        quote_info = result.get("result", {})
                        quote_id = quote_info.get("quote_id", "")
                        folder_id = quote_info.get("folder_id", "")
                        
                        # Fetch full quote details for detailed message
                        try:
                            quote_response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).single().execute()
                            if quote_response.data:
                                quote = quote_response.data
                                quote_title = quote.get("title", "New Quote")
                                client = quote.get("clients", {})
                                company_name = client.get("company", client.get("name", ""))
                                line_items = quote.get("line_items", [])
                                tax_rate = quote.get("tax_rate", "0")
                                tax_amount = quote.get("tax_amount", "0")
                                total = quote.get("total", "0")
                                
                                # Format tax rate as percentage
                                try:
                                    tax_rate_decimal = Decimal(str(tax_rate))
                                    tax_rate_display = f"{tax_rate_decimal}%"
                                except:
                                    tax_rate_display = f"{tax_rate}%"
                                
                                # Build detailed message with elegant formatting
                                ai_response = "I've created your quote, and everything is set up for you to view inside of the quote's folder! You can view the folder in your customer dashboard.\n\n"
                                ai_response += "**Quote Overview:**\n\n"
                                ai_response += f"**{quote_title}**\n\n"
                                
                                # Calculate subtotal from line items
                                subtotal = Decimal("0")
                                for item in line_items:
                                    try:
                                        qty = Decimal(str(item.get("quantity", 0)))
                                        price = Decimal(str(item.get("unit_price", "0")))
                                        subtotal += qty * price
                                    except:
                                        pass
                                
                                # Add line items with cleaner formatting
                                for item in line_items:
                                    description = item.get("description", "")
                                    quantity = item.get("quantity", 0)
                                    unit_price = item.get("unit_price", "0")
                                    try:
                                        qty = Decimal(str(quantity))
                                        price = Decimal(str(unit_price))
                                        line_total = qty * price
                                        ai_response += f"• {description}\n"
                                        ai_response += f"  {int(qty)} × ${price:.2f} = ${line_total:.2f}\n\n"
                                    except:
                                        ai_response += f"• {description}\n"
                                        ai_response += f"  {quantity} × ${unit_price}\n\n"
                                
                                # Format totals section
                                try:
                                    subtotal_decimal = Decimal(str(subtotal))
                                    tax_decimal = Decimal(str(tax_amount))
                                    total_decimal = Decimal(str(total))
                                    ai_response += "---\n"
                                    ai_response += f"Subtotal: ${subtotal_decimal:.2f}\n"
                                    ai_response += f"Tax ({tax_rate_display}): ${tax_decimal:.2f}\n"
                                    ai_response += f"**Total: ${total_decimal:.2f}**"
                                except:
                                    ai_response += "---\n"
                                    ai_response += f"Tax ({tax_rate_display}): ${tax_amount}\n"
                                    ai_response += f"**Total: ${total}**"
                            else:
                                # Fallback if quote fetch fails
                                quote_number = quote_info.get("quote_number", "")
                                ai_response = f"I've created your quote, and everything is set up for you to view inside of the quote's folder! You can view the folder in your customer dashboard."
                        except Exception as e:
                            logger.warning(f"Could not fetch quote details for message: {str(e)}")
                            # Fallback if quote fetch fails
                            quote_number = quote_info.get("quote_number", "")
                            ai_response = f"I've created your quote, and everything is set up for you to view inside of the quote's folder! You can view the folder in your customer dashboard."

                        # Add lightweight “action card” links (if FRONTEND_URL is configured)
                        try:
                            frontend_url = (os.getenv("FRONTEND_URL") or "").rstrip("/")
                            if frontend_url and folder_id:
                                folder_link = f"{frontend_url}/folders/{folder_id}"
                                quote_link = f"{frontend_url}/quotes/{quote_id}" if quote_id else ""
                                ai_response = (
                                    "✅ **Quote created**\n\n"
                                    f"- [View folder]({folder_link})\n"
                                    + (f"- [View quote]({quote_link})\n" if quote_link else "")
                                    + "\n"
                                    + ai_response
                                )
                        except Exception:
                            pass
                        
                        # Auto-assign appropriate design form based on order type
                        if folder_id and "line_items" in func_params:
                            try:
                                line_items = func_params.get("line_items", [])
                                if isinstance(line_items, list) and len(line_items) > 0:
                                    # Determine order type from line items
                                    order_type = _detect_order_type(line_items)
                                    form_slug = None
                                    
                                    if order_type == "hat":
                                        form_slug = "form-4f8ml8om"  # Custom Hat Design Form
                                    elif order_type == "coozie":
                                        form_slug = "form-rwljka86"  # Custom Coozie Design Form
                                    
                                    if form_slug:
                                        assign_result = action_executor.execute_function("assign_form_to_folder", {
                                            "folder_id": folder_id,
                                            "form_slug": form_slug
                                        }, user_message=None)
                                        # Form is automatically added to folder - no need to mention it in response
                                        logger.info(f"Auto-assigned {form_slug} to folder {folder_id} for {order_type} order")
                            except Exception as e:
                                logger.warning(f"Could not auto-assign form: {str(e)}")
                    
                    # If function failed, update response with error info
                    elif not result.get("success"):
                        error_msg = result.get("error", "Unknown error")
                        if ai_response == "I'll help you with that. Let me create the quote and set everything up for you.":
                            ai_response = f"I encountered an issue while trying to create your quote: {error_msg}. Please try again or contact support."
                        else:
                            ai_response += f"\n\n⚠️ Note: There was an issue: {error_msg}"
            
            except Exception as e:
                logger.error(f"Error executing function calls: {str(e)}", exc_info=True)
                # Don't fail, just log
        
        # Finalize: prefer updating placeholder in-place (UPDATE events are reliable; DELETE may not be delivered).
        updated_placeholder = False
        if placeholder_message_id:
            try:
                update_payload: Dict[str, Any] = {
                    "message": ai_response,
                    "message_type": "text"
                }
                if isinstance(file_message_override, dict) and file_message_override.get("message_type") == "file":
                    update_payload = {
                        "message": file_message_override.get("message") or "Quote PDF",
                        "message_type": "file",
                        "file_url": file_message_override.get("file_url"),
                        "file_name": file_message_override.get("file_name"),
                        "file_size": file_message_override.get("file_size"),
                    }
                supabase_storage.table("chat_messages").update(update_payload).eq("id", placeholder_message_id).execute()
                updated_placeholder = True
                logger.info(f"✅ [AI TASK] Placeholder message updated with final AI response")
            except Exception as e:
                logger.warning(f"⚠️ [AI TASK] Failed to finalize placeholder message {placeholder_message_id}: {str(e)}")

        if not updated_placeholder:
            # Fallback: best-effort cleanup then insert a new AI message
            _delete_placeholder()

            ai_message_data = {
                "id": str(uuid.uuid4()),
                "conversation_id": conversation_id,
                "sender_id": OCHO_USER_ID,
                "message": ai_response,
                "message_type": "text",
                "created_at": datetime.now().isoformat(),
            }
            if isinstance(file_message_override, dict) and file_message_override.get("message_type") == "file":
                ai_message_data.update({
                    "message": file_message_override.get("message") or "Quote PDF",
                    "message_type": "file",
                    "file_url": file_message_override.get("file_url"),
                    "file_name": file_message_override.get("file_name"),
                    "file_size": file_message_override.get("file_size"),
                })

            print("🤖 [AI TASK] Inserting AI message into database...")
            logger.info("🤖 [AI TASK] Inserting AI message into database...")
            message_response = supabase_storage.table("chat_messages").insert(ai_message_data).execute()
            if not message_response.data:
                print("❌ [AI TASK] Failed to insert AI message - no data returned")
                logger.error("❌ [AI TASK] Failed to insert AI message - no data returned")
                return

            # If we attached a PDF, follow up with a short action card with deep links.
            if isinstance(file_message_override, dict) and file_message_override.get("message_type") == "file":
                try:
                    frontend_url = (os.getenv("FRONTEND_URL") or "").rstrip("/")
                    if frontend_url and (created_folder_id or created_quote_id):
                        lines = ["✅ **Quote created**"]
                        if created_folder_id:
                            lines.append(f"- [View folder]({frontend_url}/folders/{created_folder_id})")
                        if created_quote_id:
                            lines.append(f"- [View quote]({frontend_url}/quotes/{created_quote_id})")
                        _insert_ai_message(conversation_id, "\n".join(lines))
                except Exception:
                    pass

            # Update conversation timestamp
            try:
                supabase_storage.table("chat_conversations").update({
                    "last_message_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                }).eq("id", conversation_id).execute()
                logger.info("✅ [AI TASK] Conversation timestamp updated")
            except Exception as e:
                logger.warning(f"⚠️ [AI TASK] Failed to update conversation timestamp: {str(e)}")

            print(f"✅ [AI TASK] AI response successfully generated and saved for conversation {conversation_id}")
            logger.info(f"✅ [AI TASK] AI response successfully generated and saved for conversation {conversation_id}")

        # Update rolling conversation summary (optional; can be disabled)
        try:
            if os.getenv("ENABLE_CHAT_SUMMARY", "true").lower() in ("1", "true", "yes"):
                prev = conversation_summary
                summary_messages = conversation_history + [
                    {"role": "user", "content": user_query},
                    {"role": "model", "content": ai_response},
                ]
                new_summary = ai_service.summarize_conversation(prev, summary_messages)
                if new_summary and new_summary != prev:
                    supabase_storage.table("chat_conversations").update({
                        "summary": new_summary,
                        "summary_updated_at": datetime.now().isoformat()
                    }).eq("id", conversation_id).execute()
        except Exception as e:
            logger.debug(f"Failed to update chat summary for conversation {conversation_id}: {str(e)}")
    
    except Exception as e:
        print(f"❌ [AI TASK] Error generating AI response asynchronously: {str(e)}")
        logger.error(f"❌ [AI TASK] Error generating AI response asynchronously: {str(e)}", exc_info=True)
        import traceback
        print(f"❌ [AI TASK] Traceback: {traceback.format_exc()}")
        _update_placeholder_to_error("Reel48 AI ran into an error generating a response. Please try again.")