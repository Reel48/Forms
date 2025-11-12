-- Form Versioning Migration
-- Create table for form version history

CREATE TABLE IF NOT EXISTS form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  form_data JSONB NOT NULL, -- Complete snapshot of form at this version
  created_by UUID, -- Optional: User who created this version
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT, -- Optional notes about this version
  UNIQUE(form_id, version_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_form_versions_form_id ON form_versions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_versions_created_at ON form_versions(created_at DESC);

COMMENT ON TABLE form_versions IS 'Version history for forms to track changes over time';
COMMENT ON COLUMN form_versions.version_number IS 'Sequential version number (1, 2, 3, ...)';
COMMENT ON COLUMN form_versions.form_data IS 'Complete JSON snapshot of the form including all fields and settings';

