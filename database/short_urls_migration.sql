-- Short URLs Migration
-- Create table for short URL mappings

CREATE TABLE IF NOT EXISTS form_short_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  short_code VARCHAR(20) UNIQUE NOT NULL, -- Short code like "abc123"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
  click_count INTEGER DEFAULT 0 -- Track clicks
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_short_urls_code ON form_short_urls(short_code);
CREATE INDEX IF NOT EXISTS idx_short_urls_form_id ON form_short_urls(form_id);

COMMENT ON TABLE form_short_urls IS 'Short URL mappings for forms to make sharing easier';
COMMENT ON COLUMN form_short_urls.short_code IS 'Unique short code used in the short URL (e.g., /s/abc123)';

