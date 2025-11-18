-- Profile Picture Migration
-- This migration adds profile_picture_url column to clients table for user profile pictures

-- Add profile_picture_url column to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Create index for better query performance (optional, but helpful if we query by profile picture)
-- CREATE INDEX IF NOT EXISTS idx_clients_profile_picture ON clients(profile_picture_url) WHERE profile_picture_url IS NOT NULL;

-- Add comment
COMMENT ON COLUMN clients.profile_picture_url IS 'URL to the user profile picture stored in Supabase Storage';

