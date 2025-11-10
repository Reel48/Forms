-- Link Clients to Auth Users Migration
-- This migration adds user_id to clients table to link clients with auth users

-- Add user_id column to clients table (nullable foreign key to auth.users)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

-- Add comment
COMMENT ON COLUMN clients.user_id IS 'Optional link to auth.users for client authentication';

