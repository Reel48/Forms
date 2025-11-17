-- Chat Feature Migration
-- Creates tables for customer-admin messaging

-- Chat conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'active', -- active, resolved, archived
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(customer_id) -- Each customer has one conversation with the company
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text', -- text, file, image
  file_url TEXT, -- For file attachments
  file_name TEXT, -- Original filename for attachments
  file_size INTEGER, -- File size in bytes
  read_at TIMESTAMP WITH TIME ZONE, -- When message was read by recipient
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_conversations_customer_id ON chat_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at ON chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_read_at ON chat_messages(read_at);

-- Enable Row Level Security (RLS)
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_conversations
-- Customers can see their own conversation
DROP POLICY IF EXISTS "Customers can view their own conversation" ON chat_conversations;
CREATE POLICY "Customers can view their own conversation"
  ON chat_conversations FOR SELECT
  USING (auth.uid() = customer_id);

-- Admins can see all conversations
DROP POLICY IF EXISTS "Admins can view all conversations" ON chat_conversations;
CREATE POLICY "Admins can view all conversations"
  ON chat_conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Customers can create their own conversation
DROP POLICY IF EXISTS "Customers can create their own conversation" ON chat_conversations;
CREATE POLICY "Customers can create their own conversation"
  ON chat_conversations FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Admins can update conversations
DROP POLICY IF EXISTS "Admins can update conversations" ON chat_conversations;
CREATE POLICY "Admins can update conversations"
  ON chat_conversations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for chat_messages
-- Users can see messages in conversations they're part of
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON chat_messages;
CREATE POLICY "Users can view messages in their conversations"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND (
        chat_conversations.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
      )
    )
  );

-- Users can send messages in conversations they're part of
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON chat_messages;
CREATE POLICY "Users can send messages in their conversations"
  ON chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND (
        chat_conversations.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
      )
    )
  );

-- Users can update their own messages (for read receipts)
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON chat_messages;
CREATE POLICY "Users can update messages in their conversations"
  ON chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND (
        chat_conversations.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
      )
    )
  );

-- Function to update last_message_at when a message is inserted
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations
  SET last_message_at = NEW.created_at,
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_message_at
DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON chat_messages;
CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Enable Realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

