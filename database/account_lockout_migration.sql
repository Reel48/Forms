-- Account Lockout Migration
-- Creates table for tracking failed login attempts and account lockouts

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45), -- IPv6 can be up to 45 chars
  success BOOLEAN DEFAULT FALSE,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  failure_reason VARCHAR(255), -- e.g., "invalid_password", "account_locked"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_success ON login_attempts(success);

-- Create table for account lockouts
CREATE TABLE IF NOT EXISTS account_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email VARCHAR(255) NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unlock_at TIMESTAMP WITH TIME ZONE NOT NULL,
  failed_attempts INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for account lockouts
CREATE INDEX IF NOT EXISTS idx_account_lockouts_user_id ON account_lockouts(user_id);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_email ON account_lockouts(email);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_unlock_at ON account_lockouts(unlock_at);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_is_locked ON account_lockouts(is_locked);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_account_lockouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for account_lockouts updated_at
CREATE TRIGGER update_account_lockouts_updated_at
  BEFORE UPDATE ON account_lockouts
  FOR EACH ROW
  EXECUTE FUNCTION update_account_lockouts_updated_at();

-- Enable Row Level Security
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_lockouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only service role can access these tables
-- Regular users should not be able to query these tables directly
CREATE POLICY "Service role only access login_attempts" ON login_attempts
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "Service role only access account_lockouts" ON account_lockouts
  FOR ALL USING (false) WITH CHECK (false);

-- Note: These tables should only be accessed via the backend API using service role key
-- The RLS policies above block all direct access, ensuring only backend can use them

-- Optional: Create a function to clean up old login attempts (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
  -- Delete login attempts older than 30 days
  DELETE FROM login_attempts
  WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a function to unlock expired lockouts
CREATE OR REPLACE FUNCTION unlock_expired_accounts()
RETURNS void AS $$
BEGIN
  -- Unlock accounts where unlock_at has passed
  UPDATE account_lockouts
  SET is_locked = FALSE, failed_attempts = 0
  WHERE is_locked = TRUE AND unlock_at < NOW();
END;
$$ LANGUAGE plpgsql;

