-- Files System Database Migration
-- Run this SQL in your Supabase SQL Editor

-- Create files table
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL, -- MIME type
  file_size BIGINT NOT NULL, -- Size in bytes
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  storage_url TEXT, -- Public URL if available
  
  -- Relationships
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
  esignature_document_id UUID REFERENCES esignature_documents(id) ON DELETE SET NULL,
  
  -- Metadata
  description TEXT,
  tags TEXT[] DEFAULT '{}', -- Array of tags for categorization
  is_reusable BOOLEAN DEFAULT false, -- Can be used in multiple folders
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create file_folder_assignments table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS file_folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(file_id, folder_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_quote_id ON files(quote_id);
CREATE INDEX IF NOT EXISTS idx_files_form_id ON files(form_id);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_is_reusable ON files(is_reusable);
CREATE INDEX IF NOT EXISTS idx_file_folder_assignments_file_id ON file_folder_assignments(file_id);
CREATE INDEX IF NOT EXISTS idx_file_folder_assignments_folder_id ON file_folder_assignments(folder_id);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION update_files_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_folder_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for files table
-- Allow admins to do everything
CREATE POLICY "Admins can manage all files" ON files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view files in their assigned folders
CREATE POLICY "Users can view files in assigned folders" ON files
  FOR SELECT
  USING (
    -- Direct folder assignment
    folder_id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
    -- Or through many-to-many assignment
    OR id IN (
      SELECT file_id FROM file_folder_assignments
      WHERE folder_id IN (
        SELECT folder_id FROM folder_assignments
        WHERE user_id = auth.uid()
      )
    )
    -- Or if user uploaded it
    OR uploaded_by = auth.uid()
  );

-- Allow users to upload files (they become the owner)
CREATE POLICY "Users can upload files" ON files
  FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

-- Allow users to update files they uploaded
CREATE POLICY "Users can update their own files" ON files
  FOR UPDATE
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

-- Allow users to delete files they uploaded
CREATE POLICY "Users can delete their own files" ON files
  FOR DELETE
  USING (uploaded_by = auth.uid());

-- Create RLS policies for file_folder_assignments table
-- Allow admins to manage all assignments
CREATE POLICY "Admins can manage all file folder assignments" ON file_folder_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view assignments for folders they have access to
CREATE POLICY "Users can view file folder assignments for accessible folders" ON file_folder_assignments
  FOR SELECT
  USING (
    folder_id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
  );

-- Allow users to create assignments if they have access to the folder
CREATE POLICY "Users can create file folder assignments for accessible folders" ON file_folder_assignments
  FOR INSERT
  WITH CHECK (
    folder_id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
    AND assigned_by = auth.uid()
  );

-- Allow users to delete assignments they created
CREATE POLICY "Users can delete their own file folder assignments" ON file_folder_assignments
  FOR DELETE
  USING (assigned_by = auth.uid());

