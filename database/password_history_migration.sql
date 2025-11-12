-- Password History Migration
-- Creates table for storing password history to prevent reuse

CREATE TABLE IF NOT EXISTS password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL, -- Hash of the password (Supabase stores this)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_password_history_created_at ON password_history(created_at);

-- Enable Row Level Security
ALTER TABLE password_history ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (for backend operations)
CREATE POLICY "Service role only access password_history" ON password_history
  FOR ALL USING (false) WITH CHECK (false);

-- Note: This table should only be accessed via the backend API using service role key
-- The RLS policy above blocks all direct access, ensuring only backend can use it

-- Function to get recent password hashes for a user (last N passwords)
CREATE OR REPLACE FUNCTION get_recent_password_hashes(p_user_id UUID, p_limit INTEGER DEFAULT 5)
RETURNS TABLE(password_hash VARCHAR(255)) AS $$
BEGIN
  RETURN QUERY
  SELECT ph.password_hash
  FROM password_history ph
  WHERE ph.user_id = p_user_id
  ORDER BY ph.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old password history (keep only last 5 per user)
CREATE OR REPLACE FUNCTION cleanup_old_password_history()
RETURNS void AS $$
BEGIN
  -- For each user, keep only the 5 most recent password hashes
  DELETE FROM password_history
  WHERE id NOT IN (
    SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
      FROM password_history
    ) ranked
    WHERE rn <= 5
  );
END;
$$ LANGUAGE plpgsql;

