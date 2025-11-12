-- Quote Builder Features Migration
-- Adds support for templates, line item categories, and auto-save

-- 1. Create quote_templates table
CREATE TABLE IF NOT EXISTS quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  title VARCHAR(255),
  notes TEXT,
  terms TEXT,
  tax_rate DECIMAL(10, 2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  line_items JSONB DEFAULT '[]'::jsonb, -- Store line items as JSON
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT false, -- Public templates available to all admins
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create line_item_categories table
CREATE TABLE IF NOT EXISTS line_item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create line_item_templates table (common line items that can be reused)
CREATE TABLE IF NOT EXISTS line_item_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES line_item_categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  default_quantity DECIMAL(10, 2) DEFAULT 1,
  default_unit_price DECIMAL(10, 2) DEFAULT 0,
  default_discount_percent DECIMAL(5, 2) DEFAULT 0,
  default_tax_rate DECIMAL(5, 2) DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Add draft_auto_save column to quotes
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS draft_auto_save JSONB,
  ADD COLUMN IF NOT EXISTS last_auto_saved_at TIMESTAMP WITH TIME ZONE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_quote_templates_created_by ON quote_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_quote_templates_is_public ON quote_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_line_item_categories_created_by ON line_item_categories(created_by);
CREATE INDEX IF NOT EXISTS idx_line_item_templates_category_id ON line_item_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_line_item_templates_created_by ON line_item_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_line_item_templates_is_public ON line_item_templates(is_public);

-- Enable RLS
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_item_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on quote_templates" ON quote_templates
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on line_item_categories" ON line_item_categories
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on line_item_templates" ON line_item_templates
  FOR ALL USING (true) WITH CHECK (true);

-- Add comments
COMMENT ON TABLE quote_templates IS 'Reusable quote templates for quick quote creation';
COMMENT ON TABLE line_item_categories IS 'Categories for organizing line items';
COMMENT ON TABLE line_item_templates IS 'Reusable line item templates with default values';

