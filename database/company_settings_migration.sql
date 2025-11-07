-- Company Settings Migration
-- This table stores seller/company information that appears on all quotes

-- Create company_settings table (single row table for company info)
-- Note: The application will always use the first row, but we don't enforce single row at DB level
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  website VARCHAR(255),
  tax_id VARCHAR(100),
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your authentication needs)
CREATE POLICY "Allow all operations on company_settings" ON company_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Insert a default row (you can update this later via the UI)
INSERT INTO company_settings (id, company_name)
VALUES (gen_random_uuid(), 'Your Company Name')
ON CONFLICT DO NOTHING;

