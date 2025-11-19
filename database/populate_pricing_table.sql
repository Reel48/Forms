-- Populate Pricing Table with Actual Products
-- Custom Hats, Custom Coozies (with and without magnets)

-- ============================================
-- STEP 1: Add Products
-- ============================================

-- Custom Hats
INSERT INTO pricing_products (product_name, product_code, description, base_price, unit, category, is_active) VALUES
  ('Custom Hats', 'HAT-001', 'Custom designed hats with embroidered logo. Minimum order: 100 hats.', 15.50, 'each', 'Headwear', true),
  ('Custom Coozies (without magnet)', 'COOZIE-001', 'Custom coozies without magnet. Minimum order: 250 coozies.', 2.00, 'each', 'Accessories', true),
  ('Custom Coozies (with magnet)', 'COOZIE-002', 'Custom coozies with magnet. Minimum order: 250 coozies.', 3.00, 'each', 'Accessories', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 2: Add Pricing Tiers for Custom Hats
-- ============================================

-- Custom Hats pricing tiers (minimum 100 hats)
INSERT INTO pricing_tiers (product_id, min_quantity, max_quantity, price_per_unit) VALUES
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 100, 199, 15.50),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 200, 299, 14.50),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 300, 399, 13.50),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 400, 499, 13.00),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 500, 749, 12.50),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 750, 999, 12.00),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 1000, 1999, 11.50),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 2000, 2999, 11.00),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 3000, 3999, 10.75),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 4000, 4999, 10.45),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 5000, NULL, 10.15);

-- ============================================
-- STEP 3: Add Pricing Tiers for Custom Coozies (without magnet)
-- ============================================

-- Custom Coozies without magnet pricing tiers (minimum 250 coozies)
INSERT INTO pricing_tiers (product_id, min_quantity, max_quantity, price_per_unit) VALUES
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-001'), 250, 499, 2.00),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-001'), 500, 999, 1.50),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-001'), 1000, 2499, 1.25),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-001'), 2500, 4999, 1.10),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-001'), 5000, NULL, 1.00);

-- ============================================
-- STEP 4: Add Pricing Tiers for Custom Coozies (with magnet)
-- ============================================

-- Custom Coozies with magnet pricing tiers (minimum 250 coozies)
INSERT INTO pricing_tiers (product_id, min_quantity, max_quantity, price_per_unit) VALUES
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-002'), 250, 499, 3.00),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-002'), 500, 999, 2.50),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-002'), 1000, 2499, 2.25),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-002'), 2500, 4999, 2.10),
  ((SELECT id FROM pricing_products WHERE product_code = 'COOZIE-002'), 5000, NULL, 2.00);

-- ============================================
-- STEP 5: Verify Your Data
-- ============================================

-- View all products with their base prices
-- SELECT product_name, product_code, base_price, unit, category FROM pricing_products WHERE is_active = true;

-- View all pricing tiers for Custom Hats
-- SELECT pp.product_name, pt.min_quantity, pt.max_quantity, pt.price_per_unit
-- FROM pricing_tiers pt
-- JOIN pricing_products pp ON pt.product_id = pp.id
-- WHERE pp.product_code = 'HAT-001'
-- ORDER BY pt.min_quantity;

-- View all pricing tiers for Custom Coozies (without magnet)
-- SELECT pp.product_name, pt.min_quantity, pt.max_quantity, pt.price_per_unit
-- FROM pricing_tiers pt
-- JOIN pricing_products pp ON pt.product_id = pp.id
-- WHERE pp.product_code = 'COOZIE-001'
-- ORDER BY pt.min_quantity;

-- View all pricing tiers for Custom Coozies (with magnet)
-- SELECT pp.product_name, pt.min_quantity, pt.max_quantity, pt.price_per_unit
-- FROM pricing_tiers pt
-- JOIN pricing_products pp ON pt.product_id = pp.id
-- WHERE pp.product_code = 'COOZIE-002'
-- ORDER BY pt.min_quantity;

-- View all products with their pricing tiers
-- SELECT 
--   pp.product_name,
--   pp.product_code,
--   pp.base_price,
--   pt.min_quantity,
--   pt.max_quantity,
--   pt.price_per_unit
-- FROM pricing_products pp
-- LEFT JOIN pricing_tiers pt ON pp.id = pt.product_id
-- WHERE pp.is_active = true
-- ORDER BY pp.product_name, pt.min_quantity;
