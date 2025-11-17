from fastapi import APIRouter, HTTPException, Depends, UploadFile, File as FastAPIFile
from typing import List, Optional
import sys
import os
import uuid
from datetime import datetime
import requests

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import ChatMessage, ChatMessageCreate, ChatConversation
from database import supabase_storage, supabase_service_role_key, supabase_url
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/api/chat", tags=["chat"])

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
                                conv["customer_email"] = None
                                conv["customer_name"] = None
                        except:
                            conv["customer_email"] = None
                            conv["customer_name"] = None
                except:
                    # If no client record, try to get from auth REST API
                    try:
                        user_url = f"{supabase_url}/auth/v1/admin/users/{conv['customer_id']}"
                        user_response = requests.get(user_url, headers=headers, timeout=10)
                        if user_response.status_code == 200:
                            user_data = user_response.json()
                            conv["customer_email"] = user_data.get("email")
                            conv["customer_name"] = user_data.get("user_metadata", {}).get("name")
                        else:
                            conv["customer_email"] = None
                            conv["customer_name"] = None
                    except:
                        conv["customer_email"] = None
                        conv["customer_name"] = None
                
                # Get unread message count (messages not read by admin)
                try:
                    unread_response = supabase_storage.table("chat_messages").select("id", count="exact").eq("conversation_id", conv["id"]).is_("read_at", "null").neq("sender_id", user["id"]).execute()
                    conv["unread_count"] = unread_response.count if unread_response.count else 0
                except:
                    conv["unread_count"] = 0
                
                # Get last message
                try:
                    last_message_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conv["id"]).order("created_at", desc=True).limit(1).single().execute()
                    if last_message_response.data:
                        conv["last_message"] = last_message_response.data
                except:
                    pass
            
            return conversations
        else:
            # Customer: Get their own conversation
            conversation_response = supabase_storage.table("chat_conversations").select("*").eq("customer_id", user["id"]).single().execute()
            if conversation_response.data:
                return [conversation_response.data]
            else:
                # Create conversation if it doesn't exist
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
        print(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get conversations: {str(e)}")

@router.get("/conversations/{conversation_id}/messages", response_model=List[ChatMessage])
async def get_messages(conversation_id: str, user = Depends(get_current_user)):
    """Get messages for a conversation."""
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
        
        # Get messages
        messages_response = supabase_storage.table("chat_messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=False).execute()
        messages = messages_response.data if messages_response.data else []
        
        return messages
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting messages: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get messages: {str(e)}")

@router.post("/messages", response_model=ChatMessage)
async def send_message(message: ChatMessageCreate, user = Depends(get_current_user)):
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
            conv_response = supabase_storage.table("chat_conversations").select("*").eq("customer_id", user["id"]).single().execute()
            if conv_response.data:
                conversation_id = conv_response.data["id"]
            else:
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
        message_data = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "sender_id": user["id"],
            "message": message.message,
            "message_type": message.message_type,
            "file_url": message.file_url,
            "file_name": message.file_name,
            "file_size": message.file_size,
            "created_at": datetime.now().isoformat()
        }
        
        message_response = supabase_storage.table("chat_messages").insert(message_data).execute()
        if not message_response.data:
            raise HTTPException(status_code=500, detail="Failed to send message")
        
        return message_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending message: {str(e)}")
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
        print(f"Error marking message as read: {str(e)}")
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
        print(f"Error marking all messages as read: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to mark all messages as read: {str(e)}")

@router.post("/messages/upload-file")
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    user = Depends(get_current_user)
):
    """Upload a file attachment for a chat message."""
    try:
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Generate unique filename
        file_id = str(uuid.uuid4())
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
        unique_filename = f"chat/{file_id}/{uuid.uuid4().hex[:8]}.{file_extension}" if file_extension else f"chat/{file_id}/{uuid.uuid4().hex[:8]}"
        
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
        print(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

