# Chat History Cleanup Implementation

## Overview
Automatic cleanup of chat messages and conversations older than 24-48 hours to save database space.

## Features

### 1. Automatic Daily Cleanup
- Runs daily at 2 AM UTC via APScheduler
- Deletes messages older than retention period (default: 48 hours)
- Deletes conversations with no recent messages
- Removes orphaned conversations (no messages at all)

### 2. Manual Cleanup Endpoint
- Admin-only endpoint: `POST /api/chat/cleanup`
- Optional `retention_hours` query parameter
- Returns cleanup statistics

### 3. Configurable Retention Period
- Environment variable: `CHAT_RETENTION_HOURS` (default: 48 hours)
- Can be overridden in manual cleanup endpoint

## Configuration

### Environment Variable
Add to AWS App Runner or `.env` file:
```
CHAT_RETENTION_HOURS=48
```

**Options:**
- `24` - Keep messages for 24 hours
- `48` - Keep messages for 48 hours (default)
- Any other number of hours

### Scheduled Task
The cleanup runs automatically daily at **2 AM UTC**. To change the schedule, edit `backend/main.py`:

```python
scheduler.add_job(
    cleanup_old_chat_history,
    trigger=CronTrigger(hour=2, minute=0),  # Change hour/minute here
    ...
)
```

## API Endpoint

### Manual Cleanup (Admin Only)
```bash
POST /api/chat/cleanup?retention_hours=24
```

**Response:**
```json
{
  "success": true,
  "message": "Chat cleanup completed",
  "stats": {
    "retention_hours": 24,
    "cutoff_time": "2025-12-08T02:00:00",
    "messages_deleted": 150,
    "conversations_deleted": 5,
    "errors": []
  }
}
```

## How It Works

1. **Message Cleanup**: Deletes all `chat_messages` where `created_at < (now - retention_hours)`
2. **Conversation Cleanup**: Deletes `chat_conversations` where:
   - `last_message_at < (now - retention_hours)`, OR
   - `last_message_at IS NULL` AND `created_at < (now - retention_hours)`, OR
   - No messages exist for the conversation (orphaned)

3. **Batch Processing**: Deletes in batches to avoid overwhelming the database:
   - Messages: 100 per batch
   - Conversations: 50 per batch

## Files Modified

- `backend/chat_cleanup.py` - Cleanup service (new)
- `backend/routers/chat.py` - Added cleanup endpoint
- `backend/main.py` - Added scheduled task
- `backend/requirements.txt` - Added `apscheduler==3.10.4`

## Testing

### Test Manual Cleanup
```bash
# As admin user
curl -X POST "https://your-api-url/api/chat/cleanup?retention_hours=24" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Verify Cleanup
Check the response for statistics on what was deleted.

## Monitoring

The cleanup task logs:
- Number of messages deleted
- Number of conversations deleted
- Any errors encountered

Check application logs for cleanup activity.

## Notes

- Cleanup is safe: Only deletes data older than retention period
- Foreign key constraints ensure conversations are deleted when messages are deleted (CASCADE)
- The scheduler starts automatically when the app starts
- If scheduler fails to start, the app will still run (cleanup can be done manually)

