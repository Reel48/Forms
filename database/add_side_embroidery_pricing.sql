-- Add Side Embroidery Products to Pricing Table
-- Side embroideries are available for hat orders:
-- - Under 300 units: $1 per side embroidery per hat (left and/or right)
-- - 300+ units: Still available but no additional cost

-- ============================================
-- STEP 1: Add Side Embroidery Products
-- ============================================

-- Left Side Embroidery (for orders under 300 units)
INSERT INTO pricing_products (product_name, product_code, description, base_price, unit, category, is_active) VALUES
  ('Side Embroidery - Left (under 300 units)', 'EMB-SIDE-LEFT', 'Left side embroidery on custom hat. Only charged for orders under 300 units. $1 per hat.', 1.00, 'each', 'Services', true),
  ('Side Embroidery - Right (under 300 units)', 'EMB-SIDE-RIGHT', 'Right side embroidery on custom hat. Only charged for orders under 300 units. $1 per hat.', 1.00, 'each', 'Services', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 2: Add Note Products for 300+ Units
-- ============================================

-- These are informational products to help the AI understand that side embroideries are free at 300+ units
INSERT INTO pricing_products (product_name, product_code, description, base_price, unit, category, is_active) VALUES
  ('Side Embroidery - Left (300+ units)', 'EMB-SIDE-LEFT-FREE', 'Left side embroidery on custom hat. FREE for orders of 300+ units.', 0.00, 'each', 'Services', true),
  ('Side Embroidery - Right (300+ units)', 'EMB-SIDE-RIGHT-FREE', 'Right side embroidery on custom hat. FREE for orders of 300+ units.', 0.00, 'each', 'Services', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 3: Verify Your Data
-- ============================================

-- View all side embroidery products
-- SELECT product_name, product_code, base_price, unit, category 
-- FROM pricing_products 
-- WHERE product_code LIKE 'EMB-SIDE%' AND is_active = true;

