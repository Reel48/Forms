-- Profile Onboarding Migration
-- Adds profile_completed_at field to track when users complete their profile setup
-- Run this SQL in your Supabase SQL Editor

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_clients_profile_completed 
ON clients(profile_completed_at) 
WHERE profile_completed_at IS NOT NULL;

-- Add comment to document the field
COMMENT ON COLUMN clients.profile_completed_at IS 'Timestamp when user completed their profile onboarding. NULL means profile is incomplete.';

