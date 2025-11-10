-- Fix RLS Infinite Recursion Issue
-- The problem: Policies that check for admin role query user_roles table,
-- which triggers RLS policy check again, causing infinite recursion.
-- Solution: Use a security definer function to bypass RLS when checking admin status

-- 1. Create a security definer function to check if user is admin
-- This function runs with the privileges of the function creator (bypasses RLS)
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

-- 2. Drop the problematic policies
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can read all quote assignments" ON quote_assignments;
DROP POLICY IF EXISTS "Admins can create quote assignments" ON quote_assignments;
DROP POLICY IF EXISTS "Admins can update quote assignments" ON quote_assignments;
DROP POLICY IF EXISTS "Admins can read all form assignments" ON form_assignments;
DROP POLICY IF EXISTS "Admins can create form assignments" ON form_assignments;
DROP POLICY IF EXISTS "Admins can update form assignments" ON form_assignments;

-- 3. Recreate policies using the security definer function (no recursion!)
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can read all quote assignments" ON quote_assignments
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can create quote assignments" ON quote_assignments
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update quote assignments" ON quote_assignments
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Admins can read all form assignments" ON form_assignments
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can create form assignments" ON form_assignments
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update form assignments" ON form_assignments
  FOR UPDATE USING (is_admin(auth.uid()));

-- 4. Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO anon;

