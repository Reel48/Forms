-- Authentication and User Roles Migration
-- This migration adds user authentication, roles, and assignment tables

-- 1. Create user_roles table to extend Supabase auth.users
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'customer', -- 'admin' or 'customer'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create quote_assignments table
CREATE TABLE IF NOT EXISTS quote_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'assigned', -- assigned, viewed, accepted, declined
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(quote_id, user_id)
);

-- 3. Create form_assignments table
CREATE TABLE IF NOT EXISTS form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, expired
  access_token UUID UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(form_id, user_id)
);

-- 4. Add created_by columns to existing tables
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

ALTER TABLE forms 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 5. Link form_submissions to users
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES form_assignments(id);

-- 6. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_quote_assignments_quote_id ON quote_assignments(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_assignments_user_id ON quote_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_form_id ON form_assignments(form_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_user_id ON form_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_token ON form_assignments(access_token);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON form_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON quotes(created_by);
CREATE INDEX IF NOT EXISTS idx_forms_created_by ON forms(created_by);

-- 7. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for user_roles updated_at
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_roles_updated_at();

-- 9. Enable Row Level Security
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_assignments ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS policies
-- Allow users to read their own role
CREATE POLICY "Users can read their own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Allow admins to read all roles
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow users to read their own quote assignments
CREATE POLICY "Users can read their own quote assignments" ON quote_assignments
  FOR SELECT USING (auth.uid() = user_id);

-- Allow admins to read all quote assignments
CREATE POLICY "Admins can read all quote assignments" ON quote_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to create quote assignments
CREATE POLICY "Admins can create quote assignments" ON quote_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to update quote assignments
CREATE POLICY "Admins can update quote assignments" ON quote_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow users to read their own form assignments
CREATE POLICY "Users can read their own form assignments" ON form_assignments
  FOR SELECT USING (auth.uid() = user_id);

-- Allow admins to read all form assignments
CREATE POLICY "Admins can read all form assignments" ON form_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to create form assignments
CREATE POLICY "Admins can create form assignments" ON form_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to update form assignments
CREATE POLICY "Admins can update form assignments" ON form_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Note: For development, you may want to temporarily allow all operations
-- Uncomment the following if you need to bypass RLS during development:
-- 
-- DROP POLICY IF EXISTS "Allow all operations on user_roles" ON user_roles;
-- CREATE POLICY "Allow all operations on user_roles" ON user_roles
--   FOR ALL USING (true) WITH CHECK (true);
-- 
-- DROP POLICY IF EXISTS "Allow all operations on quote_assignments" ON quote_assignments;
-- CREATE POLICY "Allow all operations on quote_assignments" ON quote_assignments
--   FOR ALL USING (true) WITH CHECK (true);
-- 
-- DROP POLICY IF EXISTS "Allow all operations on form_assignments" ON form_assignments;
-- CREATE POLICY "Allow all operations on form_assignments" ON form_assignments
--   FOR ALL USING (true) WITH CHECK (true);

