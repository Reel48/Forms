-- Form Scheduling Migration
-- Add publish/unpublish date scheduling to forms

-- Add scheduling fields to forms table (stored in settings JSONB)
-- We'll use the settings JSONB field which already exists
-- No schema change needed, but we'll add a comment

COMMENT ON COLUMN forms.settings IS 'JSON object containing form settings (progress bar, randomize, publish_date, unpublish_date, etc.)';

-- Add index for better querying of scheduled forms
CREATE INDEX IF NOT EXISTS idx_forms_status_created ON forms(status, created_at DESC);

