-- Token Revocation Migration
-- Creates table for blacklisting revoked JWT tokens

CREATE TABLE IF NOT EXISTS revoked_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(255) NOT NULL UNIQUE, -- SHA256 hash of the token
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Original token expiration
  reason VARCHAR(255), -- e.g., "logout", "security_breach", "password_change"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_token_hash ON revoked_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user_id ON revoked_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);

-- Enable Row Level Security
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (for backend operations)
CREATE POLICY "Service role only access revoked_tokens" ON revoked_tokens
  FOR ALL USING (false) WITH CHECK (false);

-- Note: This table should only be accessed via the backend API using service role key
-- The RLS policy above blocks all direct access, ensuring only backend can use it

-- Optional: Create a function to clean up expired tokens (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_revoked_tokens()
RETURNS void AS $$
BEGIN
  -- Delete revoked tokens that have expired (original token expiration passed)
  DELETE FROM revoked_tokens
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

