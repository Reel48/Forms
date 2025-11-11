-- Add Priority Field Migration
-- This migration adds priority field to quotes and forms tables

-- Add priority column to quotes table
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';

-- Add constraint to ensure valid values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_quotes_priority'
    ) THEN
        ALTER TABLE quotes
        ADD CONSTRAINT check_quotes_priority 
        CHECK (priority IN ('normal', 'high'));
    END IF;
END $$;

-- Add priority column to forms table
ALTER TABLE forms
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';

-- Add constraint to ensure valid values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_forms_priority'
    ) THEN
        ALTER TABLE forms
        ADD CONSTRAINT check_forms_priority 
        CHECK (priority IN ('normal', 'high'));
    END IF;
END $$;

-- Update existing records to have 'normal' as default (if not already set)
UPDATE quotes
SET priority = 'normal'
WHERE priority IS NULL;

UPDATE forms
SET priority = 'normal'
WHERE priority IS NULL;

-- Add comments
COMMENT ON COLUMN quotes.priority IS 'Priority level: normal or high';
COMMENT ON COLUMN forms.priority IS 'Priority level: normal or high';

