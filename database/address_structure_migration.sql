-- Structured Address Fields Migration
-- Add structured address fields to clients table for better Stripe integration

-- Add structured address fields to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS address_city VARCHAR(100),
ADD COLUMN IF NOT EXISTS address_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS address_postal_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS address_country VARCHAR(2) DEFAULT 'US';

-- Keep existing address TEXT field (no changes needed - for backward compatibility)

-- Add comment
COMMENT ON COLUMN clients.address_line1 IS 'Street address line 1';
COMMENT ON COLUMN clients.address_line2 IS 'Street address line 2 (apartment, suite, etc.)';
COMMENT ON COLUMN clients.address_city IS 'City';
COMMENT ON COLUMN clients.address_state IS 'State or province';
COMMENT ON COLUMN clients.address_postal_code IS 'ZIP or postal code';
COMMENT ON COLUMN clients.address_country IS 'Country code (ISO 3166-1 alpha-2)';

