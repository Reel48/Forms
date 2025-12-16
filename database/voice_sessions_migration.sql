-- Voice sessions + transcripts for Gemini Live / Twilio Media Streams
-- Uses same Supabase DB as chat, without relying on auth.users for unknown callers.

CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL, -- 'twilio' | 'browser'
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  call_sid TEXT,
  stream_sid TEXT,
  from_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active|ended|error
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_id ON voice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_client_id ON voice_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_call_sid ON voice_sessions(call_sid);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_started_at ON voice_sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS voice_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, -- 'caller' | 'ai' | 'system'
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_messages_voice_session_id ON voice_messages(voice_session_id);
CREATE INDEX IF NOT EXISTS idx_voice_messages_created_at ON voice_messages(created_at DESC);

-- RLS: default to service-role-only access (backend/realtime service writes these).
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only access voice_sessions" ON voice_sessions;
CREATE POLICY "Service role only access voice_sessions" ON voice_sessions
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service role only access voice_messages" ON voice_messages;
CREATE POLICY "Service role only access voice_messages" ON voice_messages
  FOR ALL USING (false) WITH CHECK (false);

