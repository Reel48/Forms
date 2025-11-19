from fastapi import APIRouter, HTTPException, Depends, UploadFile, File as FastAPIFile, Query, BackgroundTasks
from typing import List, Optional
import sys
import os
import uuid
from datetime import datetime
import requests
import logging
import asyncio

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import ChatMessage, ChatMessageCreate, ChatConversation
from database import supabase_storage, supabase_service_role_key, supabase_url
from auth import get_current_user, get_current_admin
from ai_service import get_ai_service
from rag_service import get_rag_service

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.get("/ocho-user-id")
async def get_ocho_user_id():
    """Get Ocho (AI assistant) user ID for frontend"""
    return {"ocho_user_id": OCHO_USER_ID}

# Configure logging
logger = logging.getLogger(__name__)

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
            conversations_response = supabase_storage.table("chat_conversations").select("*").order("last_message_at", desc=True).execute()
            conversations = conversations_response.data if conversations_response.data else []
            
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
                    unread_messages_response = supabase_storage.table("chat_messages").select("conversation_id").in_("conversation_id", conversation_ids).is_("read_at", "null").neq("sender_id", user["id"]).execute()
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
                            last_message_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conv_id).order("created_at", desc=True).limit(1).single().execute()
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
            # Customer: Get their own conversation
            try:
                conversation_response = supabase_storage.table("chat_conversations").select("*").eq("customer_id", user["id"]).execute()
                if conversation_response.data and len(conversation_response.data) > 0:
                    return conversation_response.data
            except Exception as e:
                logger.warning(f"Error fetching conversation for customer {user['id']}: {str(e)}")
                # If no conversation exists, create one below
            
            # Create conversation if it doesn't exist
            try:
                new_conv = {
                    "id": str(uuid.uuid4()),
                    "customer_id": user["id"],
                    "status": "active",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }
                create_response = supabase_storage.table("chat_conversations").insert(new_conv).execute()
                if create_response.data:
                    return [create_response.data[0]]
                return []
            except Exception as e:
                logger.error(f"Error creating conversation for customer {user['id']}: {str(e)}")
                raise HTTPException(status_code=500, detail="Failed to create conversation")
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
            
            # Get or create conversation
            try:
                conv_response = supabase_storage.table("chat_conversations").select("*").eq("customer_id", user["id"]).execute()
                if conv_response.data and len(conv_response.data) > 0:
                    conversation_id = conv_response.data[0]["id"]
                else:
                    raise Exception("No conversation found")
            except:
                # Create new conversation
                new_conv = {
                    "id": str(uuid.uuid4()),
                    "customer_id": user["id"],
                    "status": "active",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }
                create_response = supabase_storage.table("chat_conversations").insert(new_conv).execute()
                if not create_response.data:
                    raise HTTPException(status_code=500, detail="Failed to create conversation")
                conversation_id = create_response.data[0]["id"]
        
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
                # Check if admin has responded recently (within last 5 messages)
                recent_messages_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=True).limit(5).execute()
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
                        role_response = supabase_storage.table("user_roles").select("role").eq("user_id", sender_id).single().execute()
                        if role_response.data and role_response.data.get("role") == "admin":
                            admin_responded_recently = True
                            logger.info(f"Admin {sender_id} has responded recently, skipping AI auto-response for conversation {conversation_id}")
                            break
                    except Exception as role_check_error:
                        # If we can't verify, log but don't assume it's an admin
                        logger.debug(f"Could not verify role for sender {sender_id}: {str(role_check_error)}")
                        # Don't treat unknown senders as admins - let AI respond
                        continue
                
                # Only auto-respond if admin hasn't responded recently
                if not admin_responded_recently:
                    # Trigger AI response asynchronously using BackgroundTasks
                    # This ensures the task completes even after the request returns
                    logger.info(f"🔵 Triggering AI response for conversation {conversation_id}, customer {user['id']}")
                    try:
                        # Use BackgroundTasks to ensure task completes
                        background_tasks.add_task(_generate_ai_response_async, conversation_id, user["id"])
                        logger.info(f"✅ AI response task added to background tasks")
                    except Exception as task_error:
                        logger.error(f"❌ Failed to add AI response to background tasks: {str(task_error)}", exc_info=True)
            except Exception as e:
                logger.error(f"Failed to trigger AI response: {str(e)}", exc_info=True)
                # Don't fail the message send if AI fails
        
        return message_response.data[0]
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

@router.post("/conversations/{conversation_id}/ai-response", response_model=ChatMessage)
async def generate_ai_response(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """
    Generate AI response for a conversation.
    This endpoint can be called after a customer sends a message to get an AI response.
    """
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
        
        # Only generate AI responses for customer conversations (not admin-to-admin)
        if is_admin and conv["customer_id"] == user["id"]:
            raise HTTPException(status_code=400, detail="AI responses are only available for customer conversations")
        
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
        
        # Generate AI response
        try:
            ai_service = get_ai_service()
            ai_response = ai_service.generate_response(
                user_message=user_query,
                conversation_history=conversation_history,
                context=context,
                customer_context=customer_context
            )
        except ValueError as e:
            # AI service not configured
            logger.error(f"AI service not available: {str(e)}")
            raise HTTPException(status_code=503, detail="AI service is not configured. Please set GEMINI_API_KEY environment variable.")
        except Exception as e:
            logger.error(f"Error generating AI response: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to generate AI response: {str(e)}")
        
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


async def _generate_ai_response_async(conversation_id: str, customer_id: str) -> None:
    """Asynchronously generate AI response for a customer message"""
    logger.info(f"Starting AI response generation for conversation {conversation_id}, customer {customer_id}")
    try:
        # Small delay to ensure message is saved
        logger.info(f"Waiting 1.5 seconds before generating AI response...")
        await asyncio.sleep(1.5)
        logger.info(f"Delay complete, proceeding with AI response generation")
        
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
                        return
                except Exception as role_check_error:
                    # If we can't verify, log but don't assume it's an admin - proceed with AI response
                    logger.debug(f"Could not verify role for sender {latest_sender_id}: {str(role_check_error)}")
        
        # Get recent messages for context
        messages_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=True).limit(10).execute()
        messages = messages_response.data if messages_response.data else []
        
        if not messages:
            return
        
        # Get the most recent customer message
        latest_customer_message = None
        for msg in messages:
            if msg.get("sender_id") == customer_id and msg.get("message"):
                latest_customer_message = msg
                break
        
        if not latest_customer_message:
            return
        
        user_query = latest_customer_message.get("message", "")
        
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
        
        # Generate AI response
        try:
            ai_service = get_ai_service()
            logger.info(f"AI service obtained, generating response for query: '{user_query[:100]}...'")
            logger.info(f"Context retrieved (length: {len(context)} chars)")
            ai_response = ai_service.generate_response(
                user_message=user_query,
                conversation_history=conversation_history,
                context=context,
                customer_context=customer_context
            )
            if not ai_response or len(ai_response.strip()) == 0:
                logger.warning(f"AI service returned empty response")
                return
            logger.info(f"✅ AI response generated successfully (length: {len(ai_response)} chars)")
        except ValueError as ve:
            logger.error(f"❌ AI service not configured: {str(ve)}")
            return  # Don't create an error message, just skip
        except Exception as ai_error:
            logger.error(f"❌ Error calling AI service: {str(ai_error)}", exc_info=True)
            return  # Don't create an error message, just skip
        
        # Create AI message
        ai_message_data = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "sender_id": OCHO_USER_ID,
            "message": ai_response,
            "message_type": "text",
            "created_at": datetime.now().isoformat()
        }
        
        logger.info(f"Inserting AI message into database...")
        message_response = supabase_storage.table("chat_messages").insert(ai_message_data).execute()
        if message_response.data:
            logger.info(f"AI message inserted successfully: {message_response.data[0].get('id')}")
            # Update conversation timestamp
            try:
                supabase_storage.table("chat_conversations").update({
                    "last_message_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }).eq("id", conversation_id).execute()
                logger.info(f"Conversation timestamp updated")
            except Exception as e:
                logger.warning(f"Failed to update conversation timestamp: {str(e)}")
            
            logger.info(f"✅ AI response successfully generated and saved for conversation {conversation_id}")
        else:
            logger.error(f"Failed to insert AI message - no data returned")
    
    except Exception as e:
        logger.error(f"❌ Error generating AI response asynchronously: {str(e)}", exc_info=True)

