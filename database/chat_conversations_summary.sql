-- Chat conversation rolling summary memory
-- Adds lightweight long-term memory fields for better AI coherence.

alter table public.chat_conversations
  add column if not exists summary text,
  add column if not exists summary_updated_at timestamptz;

