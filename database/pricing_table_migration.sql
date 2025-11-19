-- Pricing Table Migration
-- Creates a dedicated pricing table for AI to reference
-- This replaces pulling pricing from individual quotes

-- Create pricing_products table
CREATE TABLE IF NOT EXISTS pricing_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name VARCHAR(255) NOT NULL,
  product_code VARCHAR(100),
  description TEXT,
  base_price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'each', -- each, per_unit, per_hour, etc.
  category VARCHAR(100), -- Optional category grouping
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pricing_discounts table
CREATE TABLE IF NOT EXISTS pricing_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_name VARCHAR(255) NOT NULL,
  discount_type VARCHAR(50) NOT NULL, -- 'percentage', 'fixed_amount', 'tier'
  discount_value DECIMAL(10, 2) NOT NULL, -- Percentage (0-100) or fixed amount
  min_quantity DECIMAL(10, 2), -- Minimum quantity for discount to apply
  max_quantity DECIMAL(10, 2), -- Maximum quantity (for tiered discounts)
  applicable_to VARCHAR(50) DEFAULT 'all', -- 'all', 'category', 'product'
  applicable_category VARCHAR(100), -- If applicable_to = 'category'
  applicable_product_id UUID REFERENCES pricing_products(id), -- If applicable_to = 'product'
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pricing_tiers table (for volume-based pricing)
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES pricing_products(id) ON DELETE CASCADE,
  min_quantity DECIMAL(10, 2) NOT NULL,
  max_quantity DECIMAL(10, 2), -- NULL means unlimited
  price_per_unit DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pricing_products_category ON pricing_products(category);
CREATE INDEX IF NOT EXISTS idx_pricing_products_active ON pricing_products(is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_discounts_active ON pricing_discounts(is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_discounts_applicable ON pricing_discounts(applicable_to, applicable_category, applicable_product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_product ON pricing_tiers(product_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_pricing_products_updated_at
  BEFORE UPDATE ON pricing_products
  FOR EACH ROW
  EXECUTE FUNCTION update_pricing_updated_at();

CREATE TRIGGER update_pricing_discounts_updated_at
  BEFORE UPDATE ON pricing_discounts
  FOR EACH ROW
  EXECUTE FUNCTION update_pricing_updated_at();

-- Add comments
COMMENT ON TABLE pricing_products IS 'Master pricing table for products/services - used by AI chatbot';
COMMENT ON TABLE pricing_discounts IS 'Discount rules and promotions - used by AI chatbot';
COMMENT ON TABLE pricing_tiers IS 'Volume-based pricing tiers - used by AI chatbot';

-- Example data (you can customize these)
INSERT INTO pricing_products (product_name, product_code, description, base_price, unit, category) VALUES
  ('Custom Hat', 'HAT-001', 'Custom designed hat with logo', 25.00, 'each', 'Headwear'),
  ('Embroidery Service', 'EMB-001', 'Custom embroidery on garments', 15.00, 'per_item', 'Services'),
  ('Screen Printing', 'PRINT-001', 'Screen printing on garments', 12.00, 'per_item', 'Services')
ON CONFLICT DO NOTHING;

