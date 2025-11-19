# Pricing Table Setup Guide

## Overview

The pricing table is a centralized system for managing product pricing, discounts, and volume pricing that the AI chatbot uses to answer customer questions. This replaces pulling pricing from individual quotes.

## Quick Start

### Option 1: Using SQL Script (Recommended)

1. **Open the SQL script**: `database/populate_pricing_table.sql`
2. **Customize the products** - Replace the example products with your actual products
3. **Run the script** in Supabase SQL Editor or via MCP

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project
2. Navigate to **Table Editor**
3. Find the `pricing_products` table
4. Click **Insert** and add your products manually

## Step-by-Step Setup

### Step 1: Add Your Products

For each product/service, you need:
- **Product Name**: Display name (e.g., "Custom Hat")
- **Product Code**: Unique identifier (e.g., "HAT-001")
- **Description**: Brief description
- **Base Price**: Standard price (e.g., 25.00)
- **Unit**: Pricing unit (e.g., "each", "per_item", "per_hour")
- **Category**: Product category (e.g., "Headwear", "Services")
- **Is Active**: Set to `true` to make it visible

**Example SQL:**
```sql
INSERT INTO pricing_products (product_name, product_code, description, base_price, unit, category, is_active) 
VALUES 
  ('Custom Hat', 'HAT-001', 'Custom designed hat with embroidered logo', 25.00, 'each', 'Headwear', true),
  ('Embroidery Service', 'EMB-001', 'Custom embroidery on garments', 15.00, 'per_item', 'Services', true);
```

### Step 2: Add Discounts

Discounts can be:
- **Percentage**: e.g., 10% off
- **Fixed Amount**: e.g., $5 off
- **Tiered**: Different discounts at different quantity levels

**Example - Percentage Discount:**
```sql
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, min_quantity, applicable_to, is_active) 
VALUES 
  ('Bulk Order Discount', 'percentage', 10.00, 10, 'all', true);
```

**Example - Category-Specific Discount:**
```sql
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, applicable_to, applicable_category, is_active) 
VALUES 
  ('Headwear Special', 'percentage', 5.00, 'category', 'Headwear', true);
```

**Discount Types:**
- `percentage`: Discount value is a percentage (0-100)
- `fixed_amount`: Discount value is a dollar amount
- `tier`: For tiered pricing (use pricing_tiers table instead)

**Applicable To:**
- `all`: Applies to all products
- `category`: Applies to a specific category (set `applicable_category`)
- `product`: Applies to a specific product (set `applicable_product_id`)

### Step 3: Add Volume Pricing Tiers (Optional)

For quantity-based pricing (e.g., "Buy 10-24, get $2 off each"):

```sql
-- First, get the product ID
SELECT id FROM pricing_products WHERE product_code = 'HAT-001';

-- Then add tiers
INSERT INTO pricing_tiers (product_id, min_quantity, max_quantity, price_per_unit) 
VALUES 
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 10, 24, 23.00),
  ((SELECT id FROM pricing_products WHERE product_code = 'HAT-001'), 25, NULL, 20.00);
```

**Notes:**
- `max_quantity` can be `NULL` for "unlimited"
- Tiers override `base_price` when quantity thresholds are met
- Tiers are evaluated in order (lowest to highest quantity)

## Common Units

- `each` - Per individual item
- `per_item` - Per item (same as each)
- `per_hour` - Hourly rate
- `per_project` - Per project/order
- `per_order` - Per order
- `per_unit` - Generic unit

## Common Categories

- `Headwear` - Hats, caps, etc.
- `Apparel` - Clothing items
- `Services` - Service offerings
- `Design` - Design services
- `Printing` - Printing services
- `Custom` - Custom products

## Managing Your Pricing

### View All Products
```sql
SELECT * FROM pricing_products WHERE is_active = true ORDER BY category, product_name;
```

### Update a Product Price
```sql
UPDATE pricing_products 
SET base_price = 30.00 
WHERE product_code = 'HAT-001';
```

### Deactivate a Product (Hide without deleting)
```sql
UPDATE pricing_products 
SET is_active = false 
WHERE product_code = 'HAT-001';
```

### View All Discounts
```sql
SELECT * FROM pricing_discounts WHERE is_active = true;
```

### Add a Time-Limited Discount
```sql
INSERT INTO pricing_discounts (discount_name, discount_type, discount_value, applicable_to, valid_from, valid_until, is_active) 
VALUES 
  ('Holiday Sale', 'percentage', 20.00, 'all', '2024-12-01', '2024-12-31', true);
```

## How the AI Uses This

When a customer asks about pricing:

1. **AI searches pricing table** for relevant products
2. **AI includes discounts** that might apply
3. **AI references customer's quotes** (without pricing details) for context
4. **AI provides accurate, consistent pricing** from the centralized table

**Example Customer Query**: "How much does a custom hat cost?"

**AI Response**: 
> "A custom hat costs $25.00 each. If you order 10 or more items, you'll receive a 10% bulk discount. I see you have a quote #123 for a custom hat order that's currently sent."

## Best Practices

1. **Keep Product Codes Unique**: Use consistent naming (e.g., HAT-001, HAT-002)
2. **Use Categories**: Group related products for easier management
3. **Set Clear Descriptions**: Help AI understand what each product is
4. **Keep Discounts Simple**: Start with basic discounts, add complexity later
5. **Test Pricing**: Verify pricing appears correctly in AI responses
6. **Update Regularly**: Keep pricing current as your business changes

## Troubleshooting

### Product Not Showing in AI Responses
- Check `is_active = true`
- Verify product name/description contains keywords from customer query
- Check that pricing table has data (run `SELECT COUNT(*) FROM pricing_products;`)

### Discount Not Applying
- Check `is_active = true`
- Verify `min_quantity` is met
- Check `applicable_to` matches product/category
- Verify `valid_from` and `valid_until` dates (if set)

### Pricing Tiers Not Working
- Verify `product_id` matches actual product
- Check tier quantities don't overlap incorrectly
- Ensure `min_quantity` and `max_quantity` are logical

## Next Steps

1. ✅ Run the populate script with your products
2. ✅ Test AI responses with pricing questions
3. ✅ Adjust products/discounts as needed
4. ✅ Consider creating an admin UI for easier management (future enhancement)

## Need Help?

- Check `database/populate_pricing_table.sql` for example data
- Review `AI_SECURITY_AND_PRICING_UPDATE.md` for technical details
- Test queries in Supabase SQL Editor before running in production

