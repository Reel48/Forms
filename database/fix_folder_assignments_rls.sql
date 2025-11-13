-- Fix RLS Infinite Recursion in folder_assignments and folders
-- The problem: 
-- 1. folder_assignments policy queries folders table
-- 2. folders policy queries folder_assignments table
-- This creates a circular dependency causing infinite recursion
-- Solution: Use security definer functions to break the cycle

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view folder assignments for accessible folders" ON folder_assignments;

-- Recreate the policy without recursion
-- Users can view assignments where:
-- 1. They are the assigned user (user_id = auth.uid())
-- 2. They created the folder (folder_id IN folders they created)
CREATE POLICY "Users can view folder assignments for accessible folders" ON folder_assignments
  FOR SELECT
  USING (
    user_id = auth.uid()  -- Direct check: user can see their own assignments
    OR folder_id IN (
      SELECT id FROM folders WHERE created_by = auth.uid()
    )
  );

-- Also fix the admin policy to use the is_admin function if it exists
-- First check if is_admin function exists, if not create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_admin'
  ) THEN
    CREATE OR REPLACE FUNCTION is_admin(user_id_to_check UUID)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = user_id_to_check AND role = 'admin'
      );
    END;
    $$;
    
    GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION is_admin(UUID) TO anon;
  END IF;
END
$$;

-- Update admin policy to use is_admin function (avoids recursion in user_roles check)
DROP POLICY IF EXISTS "Admins can manage all folder assignments" ON folder_assignments;

CREATE POLICY "Admins can manage all folder assignments" ON folder_assignments
  FOR ALL
  USING (is_admin(auth.uid()));

-- Fix similar issue in form_folder_assignments
DROP POLICY IF EXISTS "Users can view form folder assignments for accessible folders" ON form_folder_assignments;

CREATE POLICY "Users can view form folder assignments for accessible folders" ON form_folder_assignments
  FOR SELECT
  USING (
    folder_id IN (
      SELECT id FROM folders WHERE created_by = auth.uid()
    )
    OR form_id IN (
      SELECT id FROM forms WHERE created_by = auth.uid()
    )
  );

-- Fix admin policy for form_folder_assignments
DROP POLICY IF EXISTS "Admins can manage all form folder assignments" ON form_folder_assignments;

CREATE POLICY "Admins can manage all form folder assignments" ON form_folder_assignments
  FOR ALL
  USING (is_admin(auth.uid()));

-- Fix file_folder_assignments policies to avoid recursion
-- Update admin policy
DROP POLICY IF EXISTS "Admins can manage all file folder assignments" ON file_folder_assignments;

CREATE POLICY "Admins can manage all file folder assignments" ON file_folder_assignments
  FOR ALL
  USING (is_admin(auth.uid()));

-- Fix user policies to check folders directly instead of through folder_assignments
DROP POLICY IF EXISTS "Users can view file folder assignments for accessible folders" ON file_folder_assignments;

CREATE POLICY "Users can view file folder assignments for accessible folders" ON file_folder_assignments
  FOR SELECT
  USING (
    folder_id IN (
      SELECT id FROM folders WHERE created_by = auth.uid()
    )
    OR file_id IN (
      SELECT id FROM files WHERE uploaded_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create file folder assignments for accessible folders" ON file_folder_assignments;

CREATE POLICY "Users can create file folder assignments for accessible folders" ON file_folder_assignments
  FOR INSERT
  WITH CHECK (
    (
      folder_id IN (
        SELECT id FROM folders WHERE created_by = auth.uid()
      )
      OR file_id IN (
        SELECT id FROM files WHERE uploaded_by = auth.uid()
      )
    )
    AND assigned_by = auth.uid()
  );

-- Fix circular dependency in folders table
-- The folders policy queries folder_assignments, which queries folders, causing recursion
-- Solution: Use a security definer function to break the cycle

-- Create function to check folder access (bypasses RLS)
CREATE OR REPLACE FUNCTION user_has_folder_access(folder_id_to_check UUID, user_id_to_check UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user created the folder
  IF EXISTS (SELECT 1 FROM folders WHERE id = folder_id_to_check AND created_by = user_id_to_check) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if folder is assigned to user (bypasses RLS due to SECURITY DEFINER)
  IF EXISTS (SELECT 1 FROM folder_assignments WHERE folder_id = folder_id_to_check AND user_id = user_id_to_check) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION user_has_folder_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_folder_access(UUID, UUID) TO anon;

-- Drop and recreate folders policy using the function
DROP POLICY IF EXISTS "Users can view assigned folders" ON folders;

CREATE POLICY "Users can view assigned folders" ON folders
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR user_has_folder_access(id, auth.uid())
  );

-- Update admin policy on folders to use is_admin function
DROP POLICY IF EXISTS "Admins can manage all folders" ON folders;

CREATE POLICY "Admins can manage all folders" ON folders
  FOR ALL
  USING (is_admin(auth.uid()));

