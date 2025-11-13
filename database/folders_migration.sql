-- Folders System Migration
-- Creates folders table and related assignment tables

-- Create folders table
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL, -- Main quote for this folder
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE, -- Owner of the folder
  status VARCHAR(50) DEFAULT 'active', -- active, completed, archived, cancelled
  created_by UUID REFERENCES auth.users(id), -- Admin who created it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create folder_assignments table (many-to-many: users/clients to folders)
CREATE TABLE IF NOT EXISTS folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'viewer', -- viewer, editor (future: for team collaboration)
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(folder_id, user_id)
);

-- Create form_folder_assignments table (many-to-many: forms to folders)
CREATE TABLE IF NOT EXISTS form_folder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(form_id, folder_id)
);

-- Add folder_id column to quotes table
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_folders_quote_id ON folders(quote_id);
CREATE INDEX IF NOT EXISTS idx_folders_client_id ON folders(client_id);
CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(status);
CREATE INDEX IF NOT EXISTS idx_folders_created_at ON folders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_folder_assignments_folder_id ON folder_assignments(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_assignments_user_id ON folder_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_form_folder_assignments_form_id ON form_folder_assignments(form_id);
CREATE INDEX IF NOT EXISTS idx_form_folder_assignments_folder_id ON form_folder_assignments(folder_id);
CREATE INDEX IF NOT EXISTS idx_quotes_folder_id ON quotes(folder_id);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW
  EXECUTE FUNCTION update_folders_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_folder_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for folders table
-- Allow admins to do everything
CREATE POLICY "Admins can manage all folders" ON folders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view folders assigned to them
CREATE POLICY "Users can view assigned folders" ON folders
  FOR SELECT
  USING (
    id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
    OR created_by = auth.uid() -- Users can see folders they created
  );

-- Allow users to create folders (they become the creator)
CREATE POLICY "Users can create folders" ON folders
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Allow users to update folders they created (admins can update all via admin policy)
CREATE POLICY "Users can update their own folders" ON folders
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Allow users to delete folders they created (admins can delete all via admin policy)
CREATE POLICY "Users can delete their own folders" ON folders
  FOR DELETE
  USING (created_by = auth.uid());

-- Create RLS policies for folder_assignments table
-- Allow admins to manage all assignments
CREATE POLICY "Admins can manage all folder assignments" ON folder_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view assignments for folders they have access to
CREATE POLICY "Users can view folder assignments for accessible folders" ON folder_assignments
  FOR SELECT
  USING (
    folder_id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
    OR folder_id IN (
      SELECT id FROM folders WHERE created_by = auth.uid()
    )
  );

-- Create RLS policies for form_folder_assignments table
-- Allow admins to manage all form folder assignments
CREATE POLICY "Admins can manage all form folder assignments" ON form_folder_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow users to view form folder assignments for accessible folders
CREATE POLICY "Users can view form folder assignments for accessible folders" ON form_folder_assignments
  FOR SELECT
  USING (
    folder_id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
    OR folder_id IN (
      SELECT id FROM folders WHERE created_by = auth.uid()
    )
  );

