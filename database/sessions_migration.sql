-- Sessions Migration
-- Creates table for tracking active user sessions

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE, -- SHA256 hash of the access token
  refresh_token_hash VARCHAR(255), -- SHA256 hash of the refresh token
  ip_address VARCHAR(45), -- IPv6 can be up to 45 chars
  user_agent TEXT,
  device_info JSONB, -- Parsed device information
  location_info JSONB, -- Location data if available
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Enable Row Level Security
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own sessions
CREATE POLICY "Users can read their own sessions" ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Only service role can insert/update/delete (for backend operations)
CREATE POLICY "Service role only modify sessions" ON user_sessions
  FOR ALL USING (false) WITH CHECK (false);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  -- Mark expired sessions as inactive
  UPDATE user_sessions
  SET is_active = FALSE
  WHERE expires_at < NOW() AND is_active = TRUE;
  
  -- Optionally delete very old inactive sessions (older than 30 days)
  DELETE FROM user_sessions
  WHERE is_active = FALSE AND expires_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

