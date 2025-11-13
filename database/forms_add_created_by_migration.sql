-- Add created_by column to forms table
-- This migration adds the created_by column that the backend code expects

ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_forms_created_by ON forms(created_by);

-- Update RLS policy if needed (forms already has "Allow all operations" policy)
-- No policy changes needed as existing policy allows all operations

COMMENT ON COLUMN forms.created_by IS 'ID of the user/admin who created this form';

