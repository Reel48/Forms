-- Field Library Migration
-- Create table for reusable field templates

CREATE TABLE IF NOT EXISTS field_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  placeholder TEXT,
  required BOOLEAN DEFAULT false,
  validation_rules JSONB DEFAULT '{}'::jsonb,
  options JSONB DEFAULT '[]'::jsonb,
  conditional_logic JSONB DEFAULT '{}'::jsonb,
  created_by UUID, -- Optional: Link to user who created it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_field_library_type ON field_library(field_type);
CREATE INDEX IF NOT EXISTS idx_field_library_created_by ON field_library(created_by);

COMMENT ON TABLE field_library IS 'Reusable field templates that can be saved and reused across forms';
COMMENT ON COLUMN field_library.created_by IS 'ID of the user who created this field template (if applicable)';

