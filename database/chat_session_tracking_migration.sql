-- Chat Session Tracking Migration
-- Adds session management fields to chat_conversations table

-- Add session tracking columns
ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS session_id UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_active_session BOOLEAN DEFAULT true;

-- Create indexes for session tracking
CREATE INDEX IF NOT EXISTS idx_chat_conversations_session_id ON chat_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_activity_at ON chat_conversations(last_activity_at);

-- Update existing conversations to have session fields initialized
UPDATE chat_conversations
SET 
  session_id = COALESCE(session_id, gen_random_uuid()),
  session_started_at = COALESCE(session_started_at, created_at),
  last_activity_at = COALESCE(last_activity_at, COALESCE(last_message_at, created_at)),
  is_active_session = COALESCE(is_active_session, true)
WHERE session_id IS NULL OR session_started_at IS NULL OR last_activity_at IS NULL OR is_active_session IS NULL;

