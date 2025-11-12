-- Email Verification Migration
-- Creates table for storing email verification tokens

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_verified ON email_verification_tokens(verified);

-- Enable Row Level Security
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (for backend operations)
CREATE POLICY "Service role only access email_verification_tokens" ON email_verification_tokens
  FOR ALL USING (false) WITH CHECK (false);

-- Note: This table should only be accessed via the backend API using service role key
-- The RLS policy above blocks all direct access, ensuring only backend can use it

-- Optional: Create a function to clean up expired tokens (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_verification_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM email_verification_tokens
  WHERE expires_at < NOW() OR verified = TRUE;
END;
$$ LANGUAGE plpgsql;

