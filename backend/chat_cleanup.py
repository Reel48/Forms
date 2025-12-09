"""
Chat History Cleanup Service
Automatically deletes chat messages and conversations older than the retention period
"""
import os
from datetime import datetime, timedelta
from typing import Optional
import logging
from database import supabase_storage

logger = logging.getLogger(__name__)

def cleanup_old_chat_history(retention_hours: Optional[int] = None) -> dict:
    """
    Clean up chat messages and conversations older than the retention period
    
    Args:
        retention_hours: Number of hours to retain chat history (default: from env or 48)
    
    Returns:
        dict with cleanup statistics
    """
    # Get retention period from env or use default (48 hours)
    if retention_hours is None:
        retention_hours = int(os.getenv("CHAT_RETENTION_HOURS", "48"))
    
    cutoff_time = datetime.utcnow() - timedelta(hours=retention_hours)
    cutoff_iso = cutoff_time.isoformat()
    
    stats = {
        "retention_hours": retention_hours,
        "cutoff_time": cutoff_iso,
        "messages_deleted": 0,
        "conversations_deleted": 0,
        "errors": []
    }
    
    try:
        # Step 1: Delete old messages
        try:
            # Find messages older than cutoff
            old_messages_response = supabase_storage.table("chat_messages").select("id").lt("created_at", cutoff_iso).execute()
            
            if old_messages_response.data:
                message_ids = [msg["id"] for msg in old_messages_response.data]
                
                # Delete in batches to avoid overwhelming the database
                batch_size = 100
                for i in range(0, len(message_ids), batch_size):
                    batch = message_ids[i:i + batch_size]
                    delete_response = supabase_storage.table("chat_messages").delete().in_("id", batch).execute()
                    stats["messages_deleted"] += len(batch)
                
                logger.info(f"Deleted {stats['messages_deleted']} old chat messages")
            else:
                logger.info("No old chat messages to delete")
                
        except Exception as e:
            error_msg = f"Error deleting old messages: {str(e)}"
            logger.error(error_msg, exc_info=True)
            stats["errors"].append(error_msg)
        
        # Step 2: Delete conversations that are old
        try:
            # Find conversations where last_message_at is older than cutoff OR is NULL and created_at is old
            # First, get conversations with old last_message_at
            old_conversations_response = supabase_storage.table("chat_conversations").select("id,last_message_at,created_at").lt("last_message_at", cutoff_iso).execute()
            conversation_ids = [conv["id"] for conv in old_conversations_response.data] if old_conversations_response.data else []
            
            # Also get conversations with NULL last_message_at that are old
            null_last_message_response = supabase_storage.table("chat_conversations").select("id,created_at").is_("last_message_at", "null").lt("created_at", cutoff_iso).execute()
            if null_last_message_response.data:
                for conv in null_last_message_response.data:
                    if conv["id"] not in conversation_ids:
                        conversation_ids.append(conv["id"])
            
            # Also check for conversations with no messages at all (orphaned)
            all_conversations_response = supabase_storage.table("chat_conversations").select("id").execute()
            all_conv_ids = [conv["id"] for conv in all_conversations_response.data] if all_conversations_response.data else []
            
            # Check which conversations have no messages
            for conv_id in all_conv_ids:
                if conv_id not in conversation_ids:
                    messages_check = supabase_storage.table("chat_messages").select("id").eq("conversation_id", conv_id).limit(1).execute()
                    if not messages_check.data:
                        conversation_ids.append(conv_id)
            
            # Delete conversations in batches
            if conversation_ids:
                batch_size = 50
                for i in range(0, len(conversation_ids), batch_size):
                    batch = conversation_ids[i:i + batch_size]
                    delete_response = supabase_storage.table("chat_conversations").delete().in_("id", batch).execute()
                    stats["conversations_deleted"] += len(batch)
                
                logger.info(f"Deleted {stats['conversations_deleted']} old chat conversations")
            else:
                logger.info("No old chat conversations to delete")
                
        except Exception as e:
            error_msg = f"Error deleting old conversations: {str(e)}"
            logger.error(error_msg, exc_info=True)
            stats["errors"].append(error_msg)
        
        logger.info(f"Chat cleanup completed: {stats['messages_deleted']} messages, {stats['conversations_deleted']} conversations deleted")
        
    except Exception as e:
        error_msg = f"Error in chat cleanup: {str(e)}"
        logger.error(error_msg, exc_info=True)
        stats["errors"].append(error_msg)
    
    return stats

