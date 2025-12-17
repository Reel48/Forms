-- Add Typeform integration columns to forms table
-- Run this SQL in your Supabase SQL Editor

-- Add Typeform-related columns to forms table
ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS typeform_form_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS typeform_form_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS typeform_workspace_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_typeform_form BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS typeform_settings JSONB DEFAULT '{}'::jsonb;

-- Create index for Typeform form lookups
CREATE INDEX IF NOT EXISTS idx_forms_typeform_form_id ON forms(typeform_form_id);
CREATE INDEX IF NOT EXISTS idx_forms_is_typeform_form ON forms(is_typeform_form);

-- Mark all existing forms as legacy (non-Typeform)
UPDATE forms SET is_typeform_form = false WHERE is_typeform_form IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN forms.typeform_form_id IS 'The Typeform form ID from Typeform API';
COMMENT ON COLUMN forms.typeform_form_url IS 'The Typeform form URL for embedding';
COMMENT ON COLUMN forms.typeform_workspace_id IS 'The Typeform workspace ID (optional)';
COMMENT ON COLUMN forms.is_typeform_form IS 'Flag to identify Typeform forms vs legacy in-house forms';
COMMENT ON COLUMN forms.typeform_settings IS 'JSON object containing Typeform-specific settings';

