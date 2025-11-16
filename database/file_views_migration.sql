-- Create file_views table to track when users view files
CREATE TABLE IF NOT EXISTS file_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(file_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_file_views_file_id ON file_views(file_id);
CREATE INDEX IF NOT EXISTS idx_file_views_user_id ON file_views(user_id);
CREATE INDEX IF NOT EXISTS idx_file_views_file_user ON file_views(file_id, user_id);

-- Enable RLS
ALTER TABLE file_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own file views
CREATE POLICY "Users can view their own file views"
  ON file_views
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own file views
CREATE POLICY "Users can insert their own file views"
  ON file_views
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all file views (via service role, so this is mainly for direct DB access)
-- Service role will bypass RLS anyway

