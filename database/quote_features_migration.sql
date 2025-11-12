-- Quote Features Migration
-- Adds support for activity timeline, comments, versions, and share links

-- 1. Create quote_activities table for activity timeline
CREATE TABLE IF NOT EXISTS quote_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL, -- created, sent, viewed, accepted, declined, status_changed, updated, commented
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_email VARCHAR(255),
  description TEXT,
  metadata JSONB, -- Additional data like old_status, new_status, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create quote_comments table for internal admin notes
CREATE TABLE IF NOT EXISTS quote_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),
  user_email VARCHAR(255),
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT true, -- Internal notes only visible to admins
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create quote_versions table for version history
CREATE TABLE IF NOT EXISTS quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  notes TEXT,
  terms TEXT,
  expiration_date TIMESTAMP WITH TIME ZONE,
  tax_rate DECIMAL(10, 2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(20) DEFAULT 'draft',
  subtotal DECIMAL(10, 2) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) DEFAULT 0,
  line_items JSONB, -- Store line items as JSON
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(quote_id, version_number)
);

-- 4. Create quote_share_links table for shareable links
CREATE TABLE IF NOT EXISTS quote_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  share_token VARCHAR(255) UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  max_views INTEGER, -- Optional limit on number of views
  view_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Add share_token column to quotes for quick access
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS share_token VARCHAR(255);

-- 6. Add internal_notes column to quotes (separate from public notes)
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- 7. Add reminder fields to quotes
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS reminder_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quote_activities_quote_id ON quote_activities(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_activities_created_at ON quote_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_comments_quote_id ON quote_comments(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_comments_created_at ON quote_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_versions_quote_id ON quote_versions(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_versions_version_number ON quote_versions(quote_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_quote_share_links_share_token ON quote_share_links(share_token);
CREATE INDEX IF NOT EXISTS idx_quote_share_links_quote_id ON quote_share_links(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_share_token ON quotes(share_token);

-- Enable Row Level Security (RLS)
ALTER TABLE quote_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_share_links ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your authentication needs)
CREATE POLICY "Allow all operations on quote_activities" ON quote_activities
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on quote_comments" ON quote_comments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on quote_versions" ON quote_versions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on quote_share_links" ON quote_share_links
  FOR ALL USING (true) WITH CHECK (true);

-- Add comments
COMMENT ON TABLE quote_activities IS 'Tracks all activities and changes on quotes for timeline display';
COMMENT ON TABLE quote_comments IS 'Internal admin notes and comments on quotes';
COMMENT ON TABLE quote_versions IS 'Version history of quotes for tracking changes';
COMMENT ON TABLE quote_share_links IS 'Shareable links for quotes with optional expiration and view limits';

