-- AI action audit logs for chat tool execution
-- Stores function calls + results for debugging and admin visibility.

create table if not exists public.chat_ai_action_logs (
  id uuid primary key,
  request_id uuid null,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  trigger_message_id uuid null,
  function_name text not null,
  parameters jsonb null,
  success boolean not null default false,
  result jsonb null,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists chat_ai_action_logs_conversation_id_created_at_idx
  on public.chat_ai_action_logs (conversation_id, created_at desc);

