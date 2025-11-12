-- Submission Tags Migration
-- Add tags support for form submissions

CREATE TABLE IF NOT EXISTS form_submission_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  tag_name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#667eea', -- Hex color code
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(submission_id, tag_name) -- Prevent duplicate tags on same submission
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_submission_tags_submission_id ON form_submission_tags(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_tags_tag_name ON form_submission_tags(tag_name);

COMMENT ON TABLE form_submission_tags IS 'Tags for categorizing and organizing form submissions';
COMMENT ON COLUMN form_submission_tags.color IS 'Hex color code for tag display (e.g., #667eea)';

