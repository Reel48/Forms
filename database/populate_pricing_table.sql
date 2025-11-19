-- Populate Pricing Table
-- This script helps you set up your pricing products, discounts, and tiers
-- Customize the values below to match your actual products and pricing

-- ============================================
-- STEP 1: Add Your Products/Services
-- ============================================
-- Replace these examples with your actual products

INSERT INTO pricing_products (product_name, product_code, description, base_price, unit, category, is_active) VALUES
  ('Custom Hat', 'HAT-001', 'Custom designed hat with embroidered logo', 25.00, 'each', 'Headwear', true),
  ('Custom Cap', 'CAP-001', 'Custom baseball cap with logo', 22.00, 'each', 'Headwear', true),
  ('Embroidery Service', 'EMB-001', 'Custom embroidery on garments', 15.00, 'per_item', 'Services', true),
  ('Screen Printing', 'PRINT-001', 'Screen printing on garments', 12.00, 'per_item', 'Services', true),
  ('Logo Design', 'DESIGN-001', 'Custom logo design service', 150.00, 'per_project', 'Design', true),
  ('Rush Order', 'RUSH-001', 'Expedited processing (2-3 business days)', 50.00, 'per_order', 'Services', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 2: Add Discounts
-- ============================================
-- Customize these discounts to match your business rules

-- Bulk order discount (10% off for orders of 10+ items)
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, min_quantity, applicable_to, is_active) VALUES
  ('Bulk Order Discount', 'percentage', 10.00, 10, 'all', true)
ON CONFLICT DO NOTHING;

-- Volume discount (15% off for orders of 25+ items)
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, min_quantity, applicable_to, is_active) VALUES
  ('Volume Discount', 'percentage', 15.00, 25, 'all', true)
ON CONFLICT DO NOTHING;

-- Category-specific discount (5% off all Headwear)
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, applicable_to, applicable_category, is_active) VALUES
  ('Headwear Special', 'percentage', 5.00, 'category', 'Headwear', true)
ON CONFLICT DO NOTHING;

-- Fixed amount discount ($5 off orders over $100)
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, min_quantity, applicable_to, is_active) VALUES
  ('Large Order Discount', 'fixed_amount', 5.00, 100, 'all', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 3: Add Volume Pricing Tiers (Optional)
-- ============================================
-- If you want quantity-based pricing for specific products

-- Example: Custom Hat pricing tiers
-- Get the product ID first (you'll need to replace this with actual ID)
-- Or use product_code to find it

-- For Custom Hat (HAT-001) - if ordering 10-24 units, price is $23 each
-- For Custom Hat (HAT-001) - if ordering 25+ units, price is $20 each

-- First, let's create a helper query to get product IDs:
-- SELECT id, product_code FROM pricing_products WHERE product_code = 'HAT-001';

-- Then insert tiers (replace PRODUCT_ID with actual ID):
/*
INSERT INTO pricing_tiers (product_id, min_quantity, max_quantity, price_per_unit) VALUES
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 10, 24, 23.00),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 25, NULL, 20.00);
*/

-- ============================================
-- STEP 4: Verify Your Data
-- ============================================

-- View all active products
-- SELECT * FROM pricing_products WHERE is_active = true ORDER BY category, product_name;

-- View all active discounts
-- SELECT * FROM pricing_discounts WHERE is_active = true;

-- View pricing tiers
-- SELECT pt.*, pp.product_name, pp.product_code 
-- FROM pricing_tiers pt
-- JOIN pricing_products pp ON pt.product_id = pp.id
-- ORDER BY pp.product_name, pt.min_quantity;

-- ============================================
-- NOTES:
-- ============================================
-- 1. Product codes should be unique identifiers for your products
-- 2. Units can be: 'each', 'per_item', 'per_hour', 'per_project', 'per_order', etc.
-- 3. Categories help organize products (e.g., 'Headwear', 'Services', 'Design')
-- 4. Set is_active = false to hide products without deleting them
-- 5. Discounts can apply to 'all', 'category', or 'product'
-- 6. Pricing tiers override base_price when quantity thresholds are met
-- 7. The AI chatbot will automatically use this pricing information

