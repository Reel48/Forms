-- Submission Statuses Migration
-- Add review_status field to form_submissions table

ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'new'; -- new, reviewed, archived

-- Update existing submissions to have 'new' status
UPDATE form_submissions 
  SET review_status = 'new' 
  WHERE review_status IS NULL;

-- Create index for better querying
CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON form_submissions(review_status);

COMMENT ON COLUMN form_submissions.review_status IS 'Review status: new, reviewed, or archived';

