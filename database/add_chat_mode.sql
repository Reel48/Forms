-- Add chat_mode field to chat_conversations table
-- 'ai' = AI responds (default), 'human' = only admins respond

ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS chat_mode VARCHAR(20) DEFAULT 'ai' CHECK (chat_mode IN ('ai', 'human'));

-- Update existing conversations to have 'ai' as default
UPDATE chat_conversations 
SET chat_mode = 'ai' 
WHERE chat_mode IS NULL;

