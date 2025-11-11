-- Password Reset Tokens Migration
-- Creates table for storing password reset tokens

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Create index on used flag for cleanup queries
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used ON password_reset_tokens(used);

-- Enable Row Level Security
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (for backend operations)
-- Regular users should not be able to query this table directly
CREATE POLICY "Service role only access" ON password_reset_tokens
  FOR ALL USING (false) WITH CHECK (false);

-- Note: This table should only be accessed via the backend API using service role key
-- The RLS policy above blocks all direct access, ensuring only backend can use it

-- Optional: Create a function to clean up expired tokens (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM password_reset_tokens
  WHERE expires_at < NOW() OR used = TRUE;
END;
$$ LANGUAGE plpgsql;

