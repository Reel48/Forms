-- Submission Notes Migration
-- Add notes/comments table for form submissions

CREATE TABLE IF NOT EXISTS form_submission_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_submission_notes_submission_id ON form_submission_notes(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_notes_created_at ON form_submission_notes(created_at DESC);

COMMENT ON TABLE form_submission_notes IS 'Notes and comments added to form submissions by admins';
COMMENT ON COLUMN form_submission_notes.user_id IS 'Admin user who created the note';

