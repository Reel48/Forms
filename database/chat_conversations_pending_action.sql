-- Chat conversation pending action state (scheduling state machine)
-- Stores server-driven workflow state to support multi-turn scheduling in chat.

alter table public.chat_conversations
  add column if not exists pending_action jsonb,
  add column if not exists pending_action_updated_at timestamptz;

