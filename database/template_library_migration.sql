-- Template Library Migration
-- Adds is_template field to distinguish reusable templates from project-specific instances
-- Run this SQL in your Supabase SQL Editor

-- Add is_template to esignature_documents
ALTER TABLE esignature_documents 
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT true;

-- Set existing documents based on folder assignment and status
-- Documents that are signed/declined or directly assigned to folders are instances
UPDATE esignature_documents 
SET is_template = false 
WHERE folder_id IS NOT NULL 
   OR status IN ('signed', 'declined')
   OR id IN (
     SELECT DISTINCT document_id 
     FROM esignature_document_folder_assignments 
     WHERE status IN ('signed', 'declined')
   );

-- Documents in folder_assignments but not signed are templates (reusable)
-- Keep them as templates so they can be used in multiple folders

-- Add is_template to forms
ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT true;

-- Set existing forms based on folder assignment
UPDATE forms 
SET is_template = false 
WHERE folder_id IS NOT NULL;

-- Files already have is_reusable field, we'll use that
-- No changes needed for files table

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_esignature_documents_is_template ON esignature_documents(is_template);
CREATE INDEX IF NOT EXISTS idx_forms_is_template ON forms(is_template);

-- Add comments for documentation
COMMENT ON COLUMN esignature_documents.is_template IS 'True if this is a reusable template, false if it is a project-specific instance';
COMMENT ON COLUMN forms.is_template IS 'True if this is a reusable template, false if it is a project-specific instance';

