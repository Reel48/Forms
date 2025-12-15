-- Clients RLS Hardening
-- Replaces permissive development policies with user-scoped policies.
-- NOTE: Service role bypasses RLS; backend admin operations should use service role.

-- Ensure RLS is enabled
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Remove overly-permissive policy (if it exists)
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;

-- Users can read their own client profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clients'
      AND policyname = 'Users can read own client profile'
  ) THEN
    CREATE POLICY "Users can read own client profile" ON clients
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Users can update their own client profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clients'
      AND policyname = 'Users can update own client profile'
  ) THEN
    CREATE POLICY "Users can update own client profile" ON clients
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
