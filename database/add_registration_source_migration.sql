-- Add Registration Source Migration
-- This migration adds registration_source to clients table to track how accounts were created

-- Add registration_source column to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS registration_source VARCHAR(50) DEFAULT 'admin_created';

-- Add constraint to ensure valid values
ALTER TABLE clients
ADD CONSTRAINT check_registration_source 
CHECK (registration_source IN ('admin_created', 'self_registered'));

-- Update existing clients to have 'admin_created' as default (if not already set)
UPDATE clients
SET registration_source = 'admin_created'
WHERE registration_source IS NULL;

-- Add comment
COMMENT ON COLUMN clients.registration_source IS 'Tracks how the account was created: admin_created or self_registered';

